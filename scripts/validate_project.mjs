#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2),asJson=args.includes('--json');
if(args.includes('--help'))console.log('用法: node validate_project.mjs <项目目录> [--json]\n按写作计划检查章节状态和字数，回填wordCount、wordCountPass、validation。保留创作状态与retryCount，不检查摘要。仅在全部worker结束后调用。退出码0=通过，1=校验未通过，2=脚本/读取错误。');
else try{
  if(!args[0]||args[0].startsWith('--')||args.slice(1).some(a=>a!=='--json'))throw new Error('参数无效，请使用 --help');
  const root=await fs.realpath(path.resolve(args[0])),file=path.join(root,'02-写作计划.json');
  const plan=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,'')),minimum=plan.minWordsPerChapter??3000;
  if(!Array.isArray(plan.chapters)||!plan.chapters.length||!Number.isInteger(minimum)||minimum<=0)throw new Error('写作计划需要非空chapters及正整数minWordsPerChapter');
  const seen=new Set();
  for(const c of plan.chapters){
    if(!Number.isSafeInteger(c?.chapterNumber)||c.chapterNumber<1||seen.has(c.chapterNumber)||typeof c.filePath!=='string'||!c.filePath.trim())throw new Error('章节需要唯一正整数chapterNumber和有效filePath');
    const resolved=path.resolve(root,c.filePath),relative=path.relative(root,resolved);
    if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('章节路径必须在项目目录内');
    seen.add(c.chapterNumber);
  }
  const checker=fileURLToPath(new URL('./check_chapter_wordcount.mjs',import.meta.url)),checkedAt=new Date().toISOString(),tasks=[];
  let passed=0,errors=0;
  for(const c of plan.chapters){
    const issues=[];
    if(c.status==='failed')issues.push({type:'CHAPTER_FAILED',action:'核实原执行结果，处理失败原因并完成本章收尾；不能仅凭字数通过清除失败'});
    else if(c.status!=='completed')issues.push({type:'STATUS_NOT_FINAL',action:'核对本章实际完成情况，补齐未完成步骤和状态；不直接重写已有效的正文'});
    const result=spawnSync(process.execPath,[checker,path.resolve(root,c.filePath),String(minimum),'--json'],{encoding:'utf8'});
    let measured;try{measured=JSON.parse(result.stdout).results?.[0];}catch{/* A read or process error is reported below, never treated as zero words. */}
    const readError=result.error||![0,1].includes(result.status)||!measured?.exists||!Number.isFinite(measured.word_count);
    if(readError){
      c.wordCount=null;c.wordCountPass=null;errors++;
      issues.push({type:'READ_ERROR',message:result.error?.message||measured?.message||result.stderr?.trim()||'字数脚本没有返回有效结果',action:'解决正文读取或字数脚本执行问题后复检；不要按零字扩充或重写正文'});
    }else{
      c.wordCount=measured.word_count;c.wordCountPass=c.wordCount>=minimum;
      if(!c.wordCountPass)issues.push({type:'WORD_COUNT_LOW',action:'保留已有正文，按文风基准和扩充指南定向扩充至本书字数下限'});
    }
    c.validation={status:readError?'error':issues.length?'failed':'passed',issues:issues.map(i=>i.type),checkedAt};
    if(issues.length)tasks.push({chapterNumber:c.chapterNumber,title:c.title,filePath:c.filePath,status:c.status,wordCount:c.wordCount,minWords:minimum,issues});else passed++;
  }
  // Phase 4 runs only after workers have returned; preserve their state and retry counters.
  await fs.writeFile(file,JSON.stringify(plan,null,2)+'\n');
  const report={project:root,summary:{total:plan.chapters.length,passed,failed:tasks.length,errors},tasks};
  console.log(JSON.stringify(report,null,2));
  process.exitCode=errors?2:tasks.length?1:0;
}catch(error){console.log(asJson?JSON.stringify({error:error.message}):error.message);process.exitCode=2;}
