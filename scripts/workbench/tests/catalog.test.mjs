import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, plan } from './helpers.mjs';
import { createCatalog } from '../catalog.mjs';
import { updateChapter } from '../state.mjs';

export const tests = [
  ['current completed chapters need no legacy hashes or summary gate',async()=>{
    const f=await fixture();try{
      await f.write('book/02-写作计划.json',{minWordsPerChapter:2,chapters:[{chapterNumber:1,filePath:'第01章.md',status:'completed',wordCount:9,wordCountPass:true,validation:{status:'passed',issues:[]}}]});
      await f.write('book/第01章.md','# 第01章 标题\n## 本章概要\n概要\n## 正文\n正文\n## 章节备注\n备注');
      const c=await createCatalog(f.root),chapter=c.listProjects()[0].chapters[0];
      assert.equal(chapter.actualWordCount,16);
      // The deliberate mismatch remains visible; lack of hashes or summary is not an issue.
      assert.deepEqual(chapter.syncIssues,['字数记录未同步']);
      const file='book/02-写作计划.json';
      await f.write(file,{minWordsPerChapter:2,chapters:[{chapterNumber:1,filePath:'第01章.md',status:'completed',wordCount:16,wordCountPass:true}]});
      await c.refresh();assert.equal(c.listProjects()[0].chapters[0].effectiveStatus,'completed');
      assert.deepEqual(c.listProjects()[0].chapters[0].syncIssues,[]);
    }finally{await f.close();}
  }],
  ['planned summary shells show missing coverage until real events are saved',async()=>{
    const f=await fixture();try{
      await f.write('book/02-写作计划.json',{minWordsPerChapter:1,totalChapters:2,chapters:[1,2].map(chapterNumber=>({chapterNumber,filePath:`第0${chapterNumber}章.md`,status:'pending'}))});
      const shell=n=>`## 第0${n}章\n\n`;
      await f.write('book/99-章节摘要.md','# 摘要\n'+shell(1)+shell(2));const c=await createCatalog(f.root),id=c.listProjects()[0].id;
      assert.deepEqual(c.getProject(id).summaryCoverage,{available:0,canonical:0,total:2,missing:[1,2],conflicts:[]});
      await f.write('book/99-章节摘要.md','# 摘要\n'+shell(1)+'她留下了家门钥匙。\n\n'+shell(2));await c.refresh();
      assert.equal(c.getProject(id).summaryCoverage.available,1);assert.deepEqual(c.getProject(id).summaryCoverage.missing,[2]);
    }finally{await f.close();}
  }],
  ['summary changes do not invalidate the recorded writing status',async()=>{
    const f=await fixture();try{
      await f.write('book/02-写作计划.json',{minWordsPerChapter:1,chapters:[{chapterNumber:1,filePath:'第01章.md',status:'validating'}]});await f.write('book/第01章.md','正文');await f.write('book/99-章节摘要.md','## 第1章\n离开');
      await updateChapter(f.root+'/book',1,'completed');const c=await createCatalog(f.root);assert.equal(c.listProjects()[0].chapters[0].effectiveStatus,'completed');
      await f.write('book/99-章节摘要.md','## 第1章\n没有离开');await c.refresh();assert.equal(c.listProjects()[0].chapters[0].effectiveStatus,'completed');
    }finally{await f.close();}
  }],
  ['observes stale pending chapters and previews unmerged summaries without writing',async()=>{
    const f=await fixture();try{
      await f.write('book/02-写作计划.json',{...plan(),minWordsPerChapter:3});
      await f.write('book/第02章-第二章.md','# 第2章\n真正正文四字');
      await f.write('book/99-章节摘要.md','# 章节摘要\n\n模板说明');
      await f.write('book/_batch1-summaries.md','# 批次\n## 第2章 第二章\n真实摘要与后果。');
      const c=await createCatalog(f.root),p=c.listProjects()[0],chapter=p.chapters.find(c=>c.number===2);
      assert.equal(chapter.actualWordCount,6);assert.equal(chapter.actualWordCountPass,true);
      assert.equal(chapter.effectiveStatus,'needs_sync');assert.equal(chapter.summarySource,'batch');
      assert.equal(p.summaryCoverage.available,1);assert(p.summaryCoverage.missing.includes(1));
      const summary=await c.readDocument(p.id,'summary-view');assert(summary.text.includes('真实摘要与后果'));assert(summary.text.includes('未汇总'));
      assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'book/02-写作计划.json'),'utf8')).chapters[0].wordCount,3100);
    }finally{await f.close();}
  }],
  ['keeps cached chapter and plan during replacement gaps, then recovers',async()=>{
    const f=await fixture();
    try {
      const planned=await f.write('book/02-写作计划.json',plan('保留书名'));
      const chapter=await f.write('book/第02章-第二章.md','原正文');
      const c=await createCatalog(f.root),p=c.listProjects()[0],doc=p.chapters.find(c=>c.number===2);
      await c.readDocument(p.id,doc.id);
      await fs.rename(chapter,chapter+'.replacement');
      const cached=await c.readDocument(p.id,doc.id);
      assert.equal(cached.text,'原正文');assert.equal(cached.stale,true);assert(cached.warnings.length);
      await fs.rename(planned,planned+'.replacement');await c.refresh();
      assert.equal(c.getProject(p.id).title,'保留书名');assert.equal(c.getProject(p.id).totalChapters,3);assert(c.getProject(p.id).warnings.length);
      await fs.rename(chapter+'.replacement',chapter);await fs.rename(planned+'.replacement',planned);await c.refresh();
      assert.equal(c.getProject(p.id).warnings.length,0);assert.equal((await c.readDocument(p.id,doc.id)).stale,false);
      await fs.rm(f.root,{recursive:true});await c.refresh();assert.equal(c.getProject(p.id),null);
    }finally{await f.close();}
  }],
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
