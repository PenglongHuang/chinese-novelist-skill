import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fixture } from './helpers.mjs';
import { updateChapter, reconcileProject } from '../state.mjs';

export const tests=[
  ['completion gate requires counted body, canonical summary and valid transition',async()=>{
    const f=await fixture();try{
      await f.write('02-写作计划.json',{novelName:'test',minWordsPerChapter:3,chapters:[{chapterNumber:1,status:'pending',filePath:'第01章.md'}]});
      await f.write('第01章.md','# 第1章\n足够的正文');
      await assert.rejects(updateChapter(f.root,1,'completed'));
      await updateChapter(f.root,1,'in_progress');await updateChapter(f.root,1,'validating');
      await assert.rejects(updateChapter(f.root,1,'completed'));
      await f.write('99-章节摘要.md','# 摘要\n## 第1章\n行动产生了新的后果。');
      await updateChapter(f.root,1,'completed');
      const plan=JSON.parse(await fs.readFile(f.root+'/02-写作计划.json','utf8'));assert.equal(plan.chapters[0].wordCount,5);assert.equal(plan.chapters[0].summaryPass,true);assert.equal(plan.chapters[0].status,'completed');
      await f.write('第01章.md','# 第1章\n另一个正文');
      await assert.rejects(updateChapter(f.root,1,'completed'));
      const inspected=await reconcileProject(f.root);assert.equal(inspected.chapters[0].status,'validating');
    }finally{await f.close();}
  }],
  ['parallel updates keep both chapter changes and reconcile backs up without false completion',async()=>{
    const f=await fixture();try{
      await f.write('02-写作计划.json',{minWordsPerChapter:1,chapters:[1,2].map(n=>({chapterNumber:n,status:'pending',filePath:`第0${n}章.md`}))});
      await f.write('第01章.md','# 第1章\n正文');await f.write('第02章.md','# 第2章\n正文');
      await f.write('_batch1-summaries.md','# 批次\n## 第1章\n明确的事件和后果。');
      await Promise.all([updateChapter(f.root,1,'in_progress'),updateChapter(f.root,2,'in_progress')]);
      let plan=JSON.parse(await fs.readFile(f.root+'/02-写作计划.json','utf8'));assert(plan.chapters.every(c=>c.status==='in_progress'));
      const result=await reconcileProject(f.root,{apply:true});assert(result.backup);assert.deepEqual(result.missingSummaries,[2]);
      plan=JSON.parse(await fs.readFile(f.root+'/02-写作计划.json','utf8'));assert(plan.chapters.every(c=>c.status!=='completed'));assert((await fs.readFile(f.root+'/99-章节摘要.md','utf8')).includes('明确的事件和后果'));
    }finally{await f.close();}
  }],
];
