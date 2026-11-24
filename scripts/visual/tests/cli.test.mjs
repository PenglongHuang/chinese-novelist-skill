import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { fixture } from './helpers.mjs';

const cli=fileURLToPath(new URL('../workbench.mjs',import.meta.url));
export const tests=[
  ['skill CLI counts narrative through the shared single-source counter',async()=>{
    const f=await fixture();try{
      const file=await f.write('第01章-短章.md','# 第01章\n## 本章概要\n'+'概'.repeat(300)+'\n## 正文\n'+'文'.repeat(2900)+'\n## 章节备注\n'+'注'.repeat(100));
      const script=fileURLToPath(new URL('../../writing/check_chapter_wordcount.mjs',import.meta.url));
      const result=spawnSync(process.execPath,[script,file,'--json'],{encoding:'utf8'});
      assert.equal(result.status,0);
      assert.equal(JSON.parse(result.stdout).results[0].word_count,3310);
    }finally{await f.close();}
  }],
  ['CLI starts a real read-only server for a missing workspace and rejects invalid ports',async()=>{
    const f=await fixture();let child;
    try {
      const bad=spawnSync(process.execPath,[cli,'--port','invalid'],{encoding:'utf8'});assert.equal(bad.status,1);
      child=spawn(process.execPath,[cli,'--workspace',f.root+'/尚未创建','--port','0'],{stdio:['ignore','pipe','pipe']});
      const url=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('CLI did not start')),5000);child.once('error',reject);child.once('exit',code=>{if(code)reject(new Error('CLI exited '+code));});child.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/http:\/\/127\.0\.0\.1:\d+\//);if(match){clearTimeout(timer);resolve(match[0]);}});});
      const result=await new Promise((resolve,reject)=>http.get(url+'api/projects',res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve(JSON.parse(text)));}).on('error',reject));
      assert.equal(result.projects.length,0);assert(result.warnings.length);assert(result.restartCommand.includes('--port'));
    } finally {if(child&&child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}await f.close();}
  }],
  ['CLI reuses an already running workbench on the same port instead of starting a second one',async()=>{
    const f=await fixture();let first;
    try {
      await f.write('book/第01章-一.md','# 第01章\n## 正文\n'+'一'.repeat(100));
      first=spawn(process.execPath,[cli,'--workspace',f.root,'--port','0'],{stdio:['ignore','pipe','pipe']});
      const url=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('CLI did not start')),5000);first.once('error',reject);first.once('exit',code=>{if(code)reject(new Error('CLI exited '+code));});first.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/http:\/\/127\.0\.0\.1:(\d+)\//);if(match){clearTimeout(timer);resolve(match[1]);}});});
      /* 同端口再跑一次：探活命中，打印复用横幅并立即退出，不产生第二个进程 */
      const again=spawnSync(process.execPath,[cli,'--workspace',f.root,'--port',url],{encoding:'utf8'});
      assert.equal(again.status,0);
      assert.match(again.stdout,/已在运行，直接复用/);
      assert.match(again.stdout,new RegExp(`http://127\\.0\\.0\\.1:${url}/`));
      /* 复用后原实例仍在服务 */
      const result=await new Promise((resolve,reject)=>http.get(`http://127.0.0.1:${url}/api/projects`,res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve(JSON.parse(text)));}).on('error',reject));
      assert.equal(result.projects.length,1);
    } finally {if(first&&first.exitCode===null){const exited=new Promise(r=>first.once('exit',r));first.kill();await exited;}await f.close();}
  }],
  ['existing wordcount CLI preserves single/batch JSON counts and failure exit codes',async()=>{
    const f=await fixture();
    try {
      const file=await f.write('第01章-回归.md','# 第01章：回归\n'+ '字'.repeat(3100));
      const script=fileURLToPath(new URL('../../writing/check_chapter_wordcount.mjs',import.meta.url));
      const single=spawnSync(process.execPath,[script,file,'--json'],{encoding:'utf8'});
      assert.equal(single.status,0);assert.equal(JSON.parse(single.stdout).results[0].word_count,3100);
      const short=await f.write('第03章-短篇约定.md','字'.repeat(2000));
      const custom=spawnSync(process.execPath,[script,short,'1000','--json'],{encoding:'utf8'});
      assert.equal(custom.status,0);assert.equal(JSON.parse(custom.stdout).results[0].word_count,2000);
      await f.write('第02章-不足.md','# 第02章：不足\n短文');
      const batch=spawnSync(process.execPath,[script,'--all',f.root,'--json'],{encoding:'utf8'});
      assert.equal(batch.status,1);assert.equal(JSON.parse(batch.stdout).summary.failed,2);
      const customBatch=spawnSync(process.execPath,[script,'--all',f.root,'1000','--json'],{encoding:'utf8'});
      assert.equal(customBatch.status,1);assert.equal(JSON.parse(customBatch.stdout).summary.failed,1);
    } finally {await f.close();}
  }],
];
