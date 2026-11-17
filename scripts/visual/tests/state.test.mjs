import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fixture } from './helpers.mjs';
import { updateChapter, reconcileProject } from '../state.mjs';

export const tests=[
  ['completion rejects missing events, unbracketed placeholder, empty fence and commented chapters',async()=>{
    const f=await fixture();try{
      await f.write('02-写作计划.json',{minWordsPerChapter:1,chapters:[{chapterNumber:1,filePath:'第01章.md',status:'validating'}]});await f.write('第01章.md','真实正文');
      for(const body of ['### 人物当前处境\n她尚未知道真相。','### 关键事件与后果\n待补充本章摘要','### 关键事件与后果\n```markdown\n```','<!--\n## 第02章\n她离开了。\n-->']){
        await f.write('99-章节摘要.md','## 第01章\n'+body);await assert.rejects(updateChapter(f.root,1,'completed'),body);
      }
    }finally{await f.close();}
  }],
  ['empty summary shells block completion and batch merge fills only the matching shell',async()=>{
    const f=await fixture();try{
      const notes='### 作者备注\r\n请保留这里的写作说明\r\n<!-- 编辑提示：不要覆盖作者备注 -->\r\n\r\n';
      const shell='## 第02章 修伞\r\n\r\n### 关键事件与后果\r\n<!-- 先核对修伞场景 -->\r\n\r\n### 人物当前处境\r\n\r\n### 行动条件与未了事项\r\n\r\n'+notes;
      const prefix='# 摘要\r\n保留作者说明\r\n\r\n## 第01章 归家\r\n母亲将钥匙交给她。\r\n\r\n',suffix='## 第03章 放晴\r\n她归还修好的伞。\r\n\r\n## 全书交接\r\n保留收尾说明\r\n';
      const original=prefix+shell+suffix;
      await f.write('02-写作计划.json',{minWordsPerChapter:1,chapters:[{chapterNumber:2,title:'修伞',filePath:'第02章.md',status:'validating'}]});await f.write('第02章.md','修好旧伞');await f.write('99-章节摘要.md',original);
      await assert.rejects(updateChapter(f.root,2,'completed'));
      assert.deepEqual((await reconcileProject(f.root)).missingSummaries,[2]);
      await f.write('_batch1-summaries.md','## 第2章\n\n### 关键事件与后果\n她修好母亲的旧伞，留下开店的决定。\n\n### 人物当前处境\n母亲尚不知道她准备辞职。');
      await reconcileProject(f.root,{apply:true});
      const merged=await fs.readFile(f.root+'/99-章节摘要.md','utf8');
      assert.equal((merged.match(/^## 第0?2章/gm)||[]).length,1);assert(merged.startsWith(prefix));assert(merged.endsWith(suffix));assert(merged.includes('## 第02章 修伞'));assert(merged.includes('她修好母亲的旧伞'));
      assert(merged.includes(notes));assert(merged.includes('<!-- 先核对修伞场景 -->'));
      await updateChapter(f.root,2,'completed');
      await reconcileProject(f.root,{apply:true});assert.equal(await fs.readFile(f.root+'/99-章节摘要.md','utf8'),merged);
    }finally{await f.close();}
  }],
  ['rejects conflicting canonical duplicates and preserves nonchapter notes during merge',async()=>{
    const f=await fixture();try{
      await f.write('02-写作计划.json',{minWordsPerChapter:1,chapters:[{chapterNumber:1,filePath:'第01章.md',status:'validating'}]});await f.write('第01章.md','正文');
      await f.write('99-章节摘要.md','# 摘要\n作者的关键备注\n## 第1章\n主角已离开\n## 第1章\n主角未离开\n## 全书交接\n不能丢的交接说明');
      await assert.rejects(updateChapter(f.root,1,'completed'));
      const before=await fs.readFile(f.root+'/99-章节摘要.md','utf8');const result=await reconcileProject(f.root,{apply:true});
      assert(result.conflicts.includes(1));assert.equal(await fs.readFile(f.root+'/99-章节摘要.md','utf8'),before);
    }finally{await f.close();}
  }],
  ['keeps unresolved failed state even when mechanical file gates pass',async()=>{
    const f=await fixture();try{
      await f.write('02-写作计划.json',{status:'needs_attention',minWordsPerChapter:1,chapters:[{chapterNumber:1,filePath:'第01章.md',status:'failed',retryCount:3}]});await f.write('第01章.md','正文');await f.write('99-章节摘要.md','## 第1章\n有效摘要');
      const result=await reconcileProject(f.root,{apply:true});assert.equal(result.status,'needs_attention');assert(result.issues.includes(1));
    }finally{await f.close();}
  }],
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
      const existing='# 摘要\n作者的备注\n## 全书交接\n保留的交接说明';await f.write('99-章节摘要.md',existing);
      await Promise.all([updateChapter(f.root,1,'in_progress'),updateChapter(f.root,2,'in_progress')]);
      let plan=JSON.parse(await fs.readFile(f.root+'/02-写作计划.json','utf8'));assert(plan.chapters.every(c=>c.status==='in_progress'));
      const result=await reconcileProject(f.root,{apply:true});assert(result.backup);assert.deepEqual(result.missingSummaries,[2]);
      plan=JSON.parse(await fs.readFile(f.root+'/02-写作计划.json','utf8'));assert(plan.chapters.every(c=>c.status!=='completed'));assert((await fs.readFile(f.root+'/99-章节摘要.md','utf8')).includes('明确的事件和后果'));
      assert((await fs.readFile(f.root+'/99-章节摘要.md','utf8')).startsWith(existing));
    }finally{await f.close();}
  }],
];
