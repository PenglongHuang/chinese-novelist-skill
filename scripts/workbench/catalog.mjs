import fs from 'node:fs/promises';
import path from 'node:path';
import { idFor, safeFile, versionFor } from './paths.mjs';

const artifacts = {
  people: '00-人物档案.md', outline: '01-大纲.md', plan: '02-写作计划.json',
  style: '03-文风基准.md', summaries: '99-章节摘要.md',
};
const chapterPattern = /^第(\d+)章.*\.md$/;
const pictures = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);
const errorWith = (message, status) => Object.assign(new Error(message), { status });
const count = n => Number.isFinite(n) && n >= 0 ? n : null;
async function retryReplacement(operation) {
  for(let attempt=0;;attempt++) {
    try{return await operation();}
    catch(error){if(error.status===403||attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,30));}
  }
}

export async function createCatalog(workspacePath) {
  const workspace = path.resolve(workspacePath);
  let projects = new Map(), resources = new Map(), version = '', warnings = [], queue = Promise.resolve();
  const plans = new Map(), planMissing = new Map(), contentCache = new Map();

  async function entries(directory) {
    try { return await fs.readdir(directory, { withFileTypes: true }); }
    catch { return []; }
  }
  function resembles(list) {
    return list.some(e => e.isFile() && (e.name === artifacts.plan || chapterPattern.test(e.name))) ||
      list.filter(e => e.isFile() && Object.values(artifacts).includes(e.name)).length >= 2;
  }
  async function scan() {
    const next = new Map(), nextResources = new Map(); warnings = [];
    let candidates = [];
    try {
      const actual = await fs.realpath(workspace);
      const base = await entries(actual);
      candidates = resembles(base) ? [workspace] : base.filter(e => e.isDirectory() && !e.name.startsWith('.') && !['backup', 'backups', 'node_modules'].includes(e.name)).map(e => path.join(workspace, e.name));
    } catch { warnings.push('工作区目录不存在或无法读取；目录创建后会自动发现。'); }
    for (const directory of candidates) {
      const list = await entries(directory);
      const id = idFor(path.relative(workspace, directory) || '.');
      if (!resembles(list)&&!projects.has(id)) continue;
      const projectWarnings = [];
      const docs = [];
      let latest = 0;
      async function register(fileName, kind, documentId = idFor(fileName)) {
        let info = null;
        try { info = await (resources.get(`${id}/${documentId}`)?.exists ? retryReplacement(()=>safeFile(workspace,directory,fileName)) : safeFile(workspace, directory, fileName)); }
        catch (error) { if (error.status === 403) projectWarnings.push(`已阻止越界资源：${fileName}`); }
        const resource = { id: documentId, name: fileName, fileName, kind, exists: !!info, version: info ? versionFor(info.stat) : null };
        if (info) latest = Math.max(latest, info.stat.mtimeMs);
        nextResources.set(`${id}/${documentId}`, { ...resource, directory });
        return resource;
      }
      for (const [kind, file] of Object.entries(artifacts)) docs.push(await register(file, kind, kind));
      let plan = null;
      const planDoc = docs.find(d => d.kind === 'plan');
      if (planDoc.exists) {
        planMissing.delete(id);
        try {
          const parsed = await retryReplacement(async()=>{
            const info=await safeFile(workspace,directory,artifacts.plan);
            const raw=await fs.readFile(info.path,'utf8');
            const value=JSON.parse(raw.replace(/^\uFEFF/,''));
            if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.chapters))throw new Error('计划结构无效');
            return value;
          });
          plan = parsed; plans.set(id, parsed);
        } catch { plan = plans.get(id) || null; projectWarnings.push(plan ? '写作计划暂不可读，正在显示上次有效记录。' : '写作计划无法解析，进度未记录。'); }
      } else if(plans.has(id)) {
        const missed=(planMissing.get(id)||0)+1;planMissing.set(id,missed);
        if(missed<=3){plan=plans.get(id);projectWarnings.push('写作计划暂时缺失，正在显示上次有效记录。');}
        else {plans.delete(id);projectWarnings.push('写作计划文件缺失，进度未记录。');}
      }
      const chapters = [], seen = new Set();
      for (const item of plan?.chapters || []) {
        if (!item || typeof item !== 'object') continue;
        const fileName = typeof item.filePath === 'string' ? item.filePath : `第${item.chapterNumber}章.md`;
        const resource = await register(fileName, 'chapter'); seen.add(fileName);
        chapters.push({ ...resource, number: count(item.chapterNumber), title: String(item.title || fileName), recordedStatus: typeof item.status === 'string' ? item.status : null, wordCount: count(item.wordCount), wordCountPass: typeof item.wordCountPass === 'boolean' ? item.wordCountPass : null, unplanned: false });
      }
      for (const entry of list) {
        const match = chapterPattern.exec(entry.name);
        if (!match || !entry.isFile() || seen.has(entry.name)) continue;
        const resource = await register(entry.name, 'chapter');
        chapters.push({ ...resource, number: Number(match[1]), title: entry.name.replace(/^第\d+章[-：:]?/, '').replace(/\.md$/, ''), recordedStatus: null, wordCount: null, wordCountPass: null, unplanned: true });
      }
      chapters.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.fileName.localeCompare(b.fileName, 'zh-CN'));
      let outline = '';
      if (docs.find(d => d.kind === 'outline').exists) {
        try { const info = await safeFile(workspace, directory, artifacts.outline); outline = await fs.readFile(info.path, 'utf8'); } catch { /* Display document read errors on demand. */ }
      }
      const title = typeof plan?.novelName === 'string' && plan.novelName.trim() ? plan.novelName : outline.match(/^#\s+(.+?)(?:\s*大纲)?\s*$/m)?.[1] || path.basename(directory);
      next.set(id, {
        id, directoryName: path.basename(directory), title,
        genre: outline.match(/(?:\*\*)?题材(?:\*\*)?\s*[：:]\s*(.+)/)?.[1]?.replace(/\*\*/g, '').trim() || null,
        totalChapters: count(plan?.totalChapters), completedChapters: plan ? chapters.filter(c => c.recordedStatus === 'completed').length : null,
        recordedWords: plan && chapters.some(c => c.wordCount !== null) ? chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0) : null,
        recordedStatus: typeof plan?.status === 'string' ? plan.status : null,
        updatedAt: latest ? new Date(latest).toISOString() : null,
        warnings: projectWarnings, documents: docs, chapters,
      });
    }
    const changedProjects = [...new Set([...projects.keys(), ...next.keys()])].filter(id => JSON.stringify(projects.get(id)) !== JSON.stringify(next.get(id)));
    const changedDocuments = [...new Set([...resources.keys(), ...nextResources.keys()])].filter(id => resources.get(id)?.version !== nextResources.get(id)?.version);
    projects = next; resources = nextResources;
    for(const id of plans.keys())if(!projects.has(id)){plans.delete(id);planMissing.delete(id);}
    version = idFor(JSON.stringify([...projects]) + JSON.stringify(warnings));
    for (const key of contentCache.keys()) if (!resources.has(key)) contentCache.delete(key);
    return { version, changedProjects, changedDocuments };
  }
  function refresh() { queue = queue.then(scan, scan); return queue; }
  async function resolveResource(projectId, docId) {
    const resource = resources.get(`${projectId}/${docId}`);
    if (!resource) throw errorWith('找不到此资料', 404);
    // Recheck on every request, including after indexing or symlink replacement.
    const info = await safeFile(workspace, resource.directory, resource.fileName);
    return { resource, info };
  }
  async function readDocument(projectId, docId) {
    const key = `${projectId}/${docId}`;
    try {
      const { resource, info } = await retryReplacement(()=>resolveResource(projectId,docId));
      const text = await fs.readFile(info.path, 'utf8');
      const assets = {};
      for (const match of text.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) {
        const source = match[1];
        try {
          if (/^(?:[a-z]+:|\/\/|#)/i.test(source)) continue;
          const relative = path.relative(resource.directory, path.resolve(path.dirname(info.path), decodeURIComponent(source)));
          if (!pictures.has(path.extname(relative).toLowerCase())) continue;
          await safeFile(workspace, resource.directory, relative);
          assets[source] = Buffer.from(relative).toString('base64url');
        } catch { /* Unknown images remain blocked by the renderer. */ }
      }
      const result = { text, version: versionFor(info.stat), stale: false, warnings: [], assets };
      contentCache.set(key, result); return result;
    } catch (error) {
      if(error.status===403)throw error;
      if (contentCache.has(key)) return { ...contentCache.get(key), stale: true, warnings: ['资料暂不可读，显示上次成功读取的内容。'] };
      if(error.code==='ENOENT'||error.status===404)throw errorWith('资料不存在或尚未生成',404);
      throw errorWith('资料暂不可读，请重试', 503);
    }
  }
  async function readAsset(projectId, assetId) {
    const project = projects.get(projectId);
    if (!project || !/^[\w-]+$/.test(assetId)) throw errorWith('资源不存在', 404);
    const relative = Buffer.from(assetId, 'base64url').toString('utf8');
    if (!pictures.has(path.extname(relative).toLowerCase())) throw errorWith('不支持此资源类型', 403);
    const any = resources.get(`${projectId}/outline`);
    const info = await safeFile(workspace, any.directory, relative);
    return { data: await fs.readFile(info.path), extension: path.extname(relative).toLowerCase() };
  }
  await refresh();
  return { workspace, refresh, listProjects: () => [...projects.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), getProject: id => projects.get(id) || null, readDocument, readAsset, get version() { return version; }, get warnings() { return warnings; } };
}
