/* 工作区偏好（user-preferences.json）的读取归一化与受限写入。
   v1 → v2：preferredProtagonist / preferredPerspective / preferredTone 由单值字符串改为字符串数组。
   整个站点其余文件绝对只读；本模块是唯一允许落盘的例外，且仅限这一个固定文件名。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './paths.mjs';

const LIST_KEYS = ['favoriteGenres', 'preferredProtagonist', 'preferredPerspective', 'preferredTone', 'styleReferences', 'dislikes'];
const KNOWN_KEYS = [...LIST_KEYS, 'typicalChapterCount', 'creationHistory'];
const MAX_ITEM = 100, MAX_ITEMS = 50, MAX_FILE = 64 * 1024;
const errorWith = (status, message) => Object.assign(new Error(message), { status });
const PREFERENCE_FILE = 'user-preferences.json';

const cleanList = list => [...new Set(list.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))];

/* 宽容读取：任何能读出 preferences 对象的版本都归一化成 v2 形状；损坏/缺失返回 null。未知字段原样保留。 */
export function normalizePreferences(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const source = parsed.preferences;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const preferences = {};
  for (const key of LIST_KEYS) {
    const list = typeof source[key] === 'string' ? [source[key]] : Array.isArray(source[key]) ? source[key] : null;
    preferences[key] = list ? cleanList(list).slice(0, MAX_ITEMS) : [];
  }
  const count = Number(source.typicalChapterCount);
  preferences.typicalChapterCount = Number.isInteger(count) && count >= 1 && count <= 500 ? count : null;
  preferences.creationHistory = Array.isArray(source.creationHistory)
    ? source.creationHistory.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
    : [];
  for (const [key, value] of Object.entries(source)) if (!KNOWN_KEYS.includes(key)) preferences[key] = value;
  return { version: 2, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null, preferences };
}

/* 落盘序列化（catalog.updatePreferences 依赖同一格式重算版本指纹，保持字节一致） */
export const serializePreferences = document => JSON.stringify(document, null, 2) + '\n';

/* 读磁盘上的偏好文件；供 catalog 每轮扫描调用。返回 {raw, preferences}，读不到时 preferences 为 null。 */
export async function readPreferencesFile(workspace) {
  const file = path.join(workspace, PREFERENCE_FILE);
  const raw = await fs.readFile(file, 'utf8');
  let preferences = null;
  try { preferences = normalizePreferences(JSON.parse(raw.replace(/^\uFEFF/, ''))); } catch { /* 损坏文件按未初始化处理 */ }
  return { raw, preferences };
}

async function readDiskPreferences(directory) {
  try {
    const raw = await fs.readFile(path.join(directory, PREFERENCE_FILE), 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.preferences && typeof parsed.preferences === 'object' ? parsed : null;
  } catch { return null; /* 磁盘无文件或损坏：按空白起步 */ }
}

/* 受限保存：只接受白名单内的可编辑字段；creationHistory 与未知字段以磁盘为准；原子写回。 */
export async function savePreferences(workspace, body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body.preferences : null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw errorWith(400, '请求体需要包含 preferences 对象');
  const preferences = {};
  for (const key of LIST_KEYS) {
    /* 写入口从严：只接受字符串数组（读取侧 normalizePreferences 才做 v1 单值兼容） */
    const rawList = input[key];
    if (rawList != null && !Array.isArray(rawList)) throw errorWith(400, `偏好字段 ${key} 需要是字符串数组`);
    const cleaned = cleanList(Array.isArray(rawList) ? rawList : []);
    if (cleaned.some(item => item.length > MAX_ITEM)) throw errorWith(400, `偏好字段 ${key} 单项不能超过 ${MAX_ITEM} 字`);
    if (cleaned.length > MAX_ITEMS) throw errorWith(400, `偏好字段 ${key} 最多 ${MAX_ITEMS} 项`);
    preferences[key] = cleaned;
  }
  const raw = input.typicalChapterCount;
  const count = raw == null || raw === '' ? null : Number(raw);
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 500)) throw errorWith(400, '常用章数需要是 1–500 的整数');
  preferences.typicalChapterCount = count;
  const disk = await readDiskPreferences(workspace);
  const diskPrefs = disk?.preferences || {};
  preferences.creationHistory = Array.isArray(diskPrefs.creationHistory) ? diskPrefs.creationHistory : [];
  for (const [key, value] of Object.entries(diskPrefs)) if (!KNOWN_KEYS.includes(key)) preferences[key] = value;
  const document = { version: 2, updatedAt: new Date().toISOString().slice(0, 10), preferences };
  const text = serializePreferences(document);
  if (Buffer.byteLength(text) > MAX_FILE) throw errorWith(413, '偏好内容过大');
  try { await atomicWrite(path.join(workspace, PREFERENCE_FILE), text); }
  catch { throw errorWith(503, '偏好暂时无法写入，请重试'); }
  return document;
}
