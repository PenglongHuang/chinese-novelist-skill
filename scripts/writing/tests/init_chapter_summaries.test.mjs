import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cli=fileURLToPath(new URL('../init_chapter_summaries.mjs',import.meta.url));
const base=path.resolve(process.env.NOVEL_TEST_TEMP||os.tmpdir());await fs.mkdir(base,{recursive:true});
async function fixture(numbers=[1,2]){
  const root=await fs.mkdtemp(path.join(base,'novel-summary-'));
  const write=async(name,text)=>{await fs.writeFile(path.join(root,name),typeof text==='string'?text:JSON.stringify(text));};
  await write('02-写作计划.json',{totalChapters:numbers.length,chapters:numbers.map(chapterNumber=>({chapterNumber,title:'章节'+chapterNumber}))});
  return {root,write,read:()=>fs.readFile(path.join(root,'99-章节摘要.md'),'utf8'),close:async()=>{assert.equal(path.dirname(path.resolve(root)),base);await fs.rm(root,{recursive:true,force:true});}};
}
function run(f,...args){const result=spawnSync(process.execPath,[cli,f.root,...args,'--json'],{encoding:'utf8'});return {code:result.status,...JSON.parse(result.stdout||'{}'),stderr:result.stderr};}
const tests=[
  ['creates ordered chapter headings from the plan without invented summaries',async()=>{
    const f=await fixture([101,2,1]);try{
      const result=run(f);assert.equal(result.code,0,result.stderr);assert.equal(result.action,'created');
      assert.equal(await f.read(),'# 章节摘要\n\n## 第01章 章节1\n\n## 第02章 章节2\n\n## 第101章 章节101\n\n');
    }finally{await f.close();}
  }],
  ['rerunning preserves completed summaries, CRLF, comments and notes byte for byte',async()=>{
    const f=await fixture();try{
      const original='# 章节摘要\r\n作者说明\r\n\r\n## 第01章 章节1\r\n她归还钥匙。\r\n\r\n## 第02章 章节2\r\n<!-- 等待填写 -->\r\n\r\n## 作者备注\r\n不能删除。\r\n';await f.write('99-章节摘要.md',original);
      assert.equal(run(f).action,'unchanged');assert.equal(await f.read(),original);assert.equal(run(f).action,'unchanged');assert.equal(await f.read(),original);
    }finally{await f.close();}
  }],
  ['adds a missing middle heading without rewriting text or creating auxiliary files',async()=>{
    const f=await fixture([1,2,3]);try{
      const original='# 摘要\n作者说明\n\n## 第01章 章节1\n已写的前章。\n\n## 第03章 章节3\n已写的后章。\n\n## 作者备注\n保留备注。\n';await f.write('99-章节摘要.md',original);
      const result=run(f);assert.equal(result.code,0);assert.equal(result.action,'updated');assert.deepEqual((await fs.readdir(f.root)).sort(),['02-写作计划.json','99-章节摘要.md']);
      assert.equal((await f.read()).replace('## 第02章 章节2\n\n',''),original);assert.equal(run(f).action,'unchanged');
    }finally{await f.close();}
  }],
  ['invalid plans and contradictory headings fail without changing any summary',async()=>{
    const f=await fixture();try{
      const original='# 作者的原稿\n不能覆盖。';await f.write('99-章节摘要.md',original);
      for(const plan of [{totalChapters:2,chapters:[{chapterNumber:1,title:'甲'},{chapterNumber:1,title:'乙'}]},{totalChapters:3,chapters:[{chapterNumber:1,title:'甲'}]},{chapters:[{chapterNumber:1,title:'标题\n## 伪造章节'}]}]){
        await f.write('02-写作计划.json',plan);assert.equal(run(f).code,2);assert.equal(await f.read(),original);
      }
      await f.write('02-写作计划.json',{totalChapters:1,chapters:[{chapterNumber:1,title:'甲'}]});
      for(const bad of ['# 摘要\n## 第01章 乙\n已有摘要。','# 摘要\n## 第01章 甲\n甲\n## 第1章 甲\n乙']){await f.write('99-章节摘要.md',bad);assert.equal(run(f).code,1);assert.equal(await f.read(),bad);}
    }finally{await f.close();}
  }],
  ['unfinished Markdown blocks are reported before inserting headings',async()=>{
    const f=await fixture();try{
      for(const tail of ['<!-- 尚未闭合','```markdown\n尚未闭合']){
        const original='# 摘要\n## 第01章 章节1\n\n'+tail;await f.write('99-章节摘要.md',original);
        const result=run(f);assert.equal(result.code,1);assert(result.issues.some(s=>s.includes('未闭合')));assert.equal(await f.read(),original);
      }
    }finally{await f.close();}
  }],
  ['generated headings must round-trip to the plan before any file is created',async()=>{
    const f=await fixture([1]);try{
      await f.write('02-写作计划.json',{totalChapters:1,chapters:[{chapterNumber:1,title:'章末 ##'}]});
      assert.equal(run(f).code,1);await assert.rejects(f.read());
    }finally{await f.close();}
  }],
];
let failures=0;for(const [name,test] of tests){try{await test();console.log('PASS '+name);}catch(error){failures++;console.error('FAIL '+name,error);}}
console.log(`${tests.length-failures} passed, ${failures} failures`);if(failures)process.exitCode=1;
