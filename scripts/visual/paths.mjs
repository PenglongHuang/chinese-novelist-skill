import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const idFor = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
export const versionFor = stat => `${stat.mtimeMs}:${stat.size}:${stat.ino}`;
function within(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function relativeTarget(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\0') || /^[a-z]+:/i.test(relative)) {
    throw Object.assign(new Error('资源路径不可用'), { status: 403 });
  }
  const target = path.resolve(root, relative);
  if (!within(root, target)) throw Object.assign(new Error('资源超出作品目录'), { status: 403 });
  return target;
}
export async function safeFile(workspace, project, relative) {
  const target = relativeTarget(project, relative);
  const [actualWorkspace, actualProject, actualFile] = await Promise.all([workspace, project, target].map(p => fs.realpath(p)));
  if (!within(actualWorkspace, actualProject) || !within(actualProject, actualFile)) {
    throw Object.assign(new Error('资源超出工作区'), { status: 403 });
  }
  const stat = await fs.stat(actualFile);
  if (!stat.isFile()) throw Object.assign(new Error('资源不是文件'), { status: 404 });
  return { path: actualFile, stat };
}
/* 原子写：临时文件 + rename，失败时清理临时文件（章节状态与偏好保存共用） */
export async function atomicWrite(file, text) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, text); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(() => {}); }
}
