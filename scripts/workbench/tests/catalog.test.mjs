import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, plan } from './helpers.mjs';
import { createCatalog } from '../catalog.mjs';

export const tests = [
  ['discovers same-title projects, legacy chapters, numeric order without writing', async () => {
    const f = await fixture();
    try {
      await f.write('中文 空格%/02-写作计划.json', plan());
      await f.write('中文 空格%/第02章-第二章.md', '# 第二章\n正文');
      await f.write('中文 空格%/第10章-未计划.md', '后来');
      await f.write('同名/02-写作计划.json', plan());
      await f.write('旧作品/第2章-二.md', '二');
      await f.write('旧作品/第10章-十.md', '十');
      await f.write('普通/README.md', '# not novel');
      await f.write('.隐藏/02-写作计划.json', plan());
      await f.write('中文 空格%/backup/02-写作计划.json', plan());
      const c = await createCatalog(f.root);
      const projects = c.listProjects();
      assert.equal(projects.length, 3);
      assert.equal(new Set(projects.map(p => p.id)).size, 3);
      const p = projects.find(p => p.directoryName === '中文 空格%');
      assert.equal(p.recordedWords, 6100);
      assert.deepEqual(p.chapters.map(c => c.number), [1, 2, 10]);
      assert.equal(p.chapters[0].exists, false);
      assert.equal(p.chapters[2].unplanned, true);
      assert.equal((await c.readDocument(p.id, p.chapters[1].id)).text, '# 第二章\n正文');
      const direct = await createCatalog(path.join(f.root, '旧作品'));
      assert.equal(direct.listProjects().length, 1);
      assert.deepEqual(direct.listProjects()[0].chapters.map(c => c.number), [2, 10]);
      assert.deepEqual((await fs.readdir(path.join(f.root, '同名'))), ['02-写作计划.json']);
    } finally { await f.close(); }
  }],
  ['retains valid plan during partial JSON writes, recovers and detects deletion', async () => {
    const f = await fixture();
    try {
      const file = await f.write('book/02-写作计划.json', plan('初始'));
      const c = await createCatalog(f.root); const id = c.listProjects()[0].id;
      await fs.writeFile(file, '{'); await c.refresh();
      assert.equal(c.getProject(id).title, '初始');
      assert(c.getProject(id).warnings.length);
      await fs.writeFile(file, JSON.stringify(plan('更新'))); const changes = await c.refresh();
      assert.equal(c.getProject(id).title, '更新'); assert(changes.changedProjects.includes(id));
      await fs.rm(path.dirname(file), { recursive: true }); await c.refresh();
      assert.equal(c.getProject(id), null);
      const missing = await createCatalog(path.join(f.root, '不存在'));
      assert.equal(missing.listProjects().length, 0);
      await f.write('不存在/new/第01章-初.md', '初'); await missing.refresh();
      assert.equal(missing.listProjects().length, 1);
    } finally { await f.close(); }
  }],
  ['rejects plan traversal and outside symlinks, even after indexing', async () => {
    const f = await fixture(); const external = await fixture();
    try {
      await external.write('secret.md', 'secret');
      await f.write('book/02-写作计划.json', { ...plan(), chapters: [{chapterNumber:1, title:'escape', filePath:'../../secret.md'}] });
      const file = await f.write('book/第02章-正常.md', 'safe');
      const c = await createCatalog(f.root); const p = c.listProjects()[0];
      assert.equal(p.chapters[0].exists, false);
      await assert.rejects(c.readDocument(p.id, p.chapters[0].id));
      const chapter = p.chapters.find(c => c.number === 2);
      assert.equal((await c.readDocument(p.id, chapter.id)).text, 'safe');
      try {
        await fs.unlink(file); await fs.symlink(path.join(external.root, 'secret.md'), file);
        await assert.rejects(c.readDocument(p.id, chapter.id));
      } catch (e) { if (e.code !== 'EPERM') throw e; console.log('SKIP symlink privilege unavailable'); }
    } finally { await f.close(); await external.close(); }
  }],
];
