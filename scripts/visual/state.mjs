import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safeFile, idFor, atomicWrite as atomic } from './paths.mjs';
import { collectSummaries } from './inspection.mjs';
import { countNarrative, mergeChapterSummaries } from './web/documents.js';

async function locked(project,operation){
  const root=await fs.realpath(project),lock=path.join(root,'.chapter-state.lock');let handle;
  for(let n=0;n<150;n++){try{handle=await fs.open(lock,'wx');break;}catch(error){if(error.code!=='EEXIST')throw error;await new Promise(r=>setTimeout(r,20));}}
  if(!handle)throw new Error('进度正在由其他进程更新，请稍后重试；若上次进程异常退出，确认后再移除 .chapter-state.lock。');
  try{return await operation(root);}finally{await handle.close();await fs.unlink(lock);}
}
async function context(root){
  const read=async name=>fs.readFile((await safeFile(root,root,name)).path,'utf8');
  const plan=JSON.parse((await read('02-写作计划.json')).replace(/^\uFEFF/,''));
  if(!Array.isArray(plan.chapters))throw new Error('写作计划缺少 chapters');
  const summaries=await collectSummaries(await fs.readdir(root),read);
  const minimum=plan.minWordsPerChapter??3000;
  if(!Number.isInteger(minimum)||minimum<=0)throw new Error('minWordsPerChapter 必须为正整数');
  return {read,plan,summaries,minimum};
}
async function inspect(ctx,chapter){
  const text=await ctx.read(chapter.filePath),summary=ctx.summaries.entries.get(chapter.chapterNumber);
  const wordCount=countNarrative(text);
  return {wordCount,wordCountPass:wordCount>=ctx.minimum,summaryPass:summary?.kind==='canonical'&&!ctx.summaries.conflicts.has(chapter.chapterNumber),validatedContentHash:idFor(text),summaryHash:summary?idFor(summary.body):null};
}
export async function updateChapter(project,number,status){return locked(project,async root=>{
  const ctx=await context(root),chapter=ctx.plan.chapters.find(c=>c.chapterNumber===number);
  if(!chapter)throw new Error('章节不在写作计划中');
  const allowed={pending:['in_progress','validating'],in_progress:['validating','failed'],validating:['completed','failed','in_progress'],failed:['in_progress','validating'],completed:['validating']};
  if(chapter.status!==status&&!allowed[chapter.status||'pending']?.includes(status))throw new Error('不允许此状态跳转');
  if(status==='completed'||status==='validating'){
    const info=await inspect(ctx,chapter);
    if(status==='completed'&&chapter.status==='completed'&&(chapter.validatedContentHash!==info.validatedContentHash||chapter.summaryHash!==info.summaryHash))throw new Error('正文或摘要已改变，请先回到 validating 核对');
    if(status==='completed'&&(!info.wordCountPass||!info.summaryPass))throw new Error('完成门槛未通过：需要字数达标及正式章节摘要');
    Object.assign(chapter,info);
  }
  if(status==='failed')chapter.retryCount=(chapter.retryCount||0)+1;
  chapter.status=status;ctx.plan.updatedAt=new Date().toISOString();
  await atomic(path.join(root,'02-写作计划.json'),JSON.stringify(ctx.plan,null,2)+'\n');return chapter;
});}

export async function reconcileProject(project,{apply=false}={}){return locked(project,async root=>{
  const ctx=await context(root),missingSummaries=[],conflicts=[...ctx.summaries.conflicts],issues=[];
  let backup=null;
  if(apply){
    backup=path.join(root,'.state-backups',Date.now()+'-'+randomUUID());await fs.mkdir(backup,{recursive:true});
    for(const file of ['02-写作计划.json','99-章节摘要.md']){try{const text=await ctx.read(file);await fs.writeFile(path.join(backup,file),text);}catch(error){if(error.code!=='ENOENT')throw error;}}
    const additions=[...ctx.summaries.entries.values()].filter(e=>e.kind!=='canonical'&&!ctx.summaries.conflicts.has(e.number)).sort((a,b)=>a.number-b.number);
    if(additions.length){
      let original='# 章节摘要';try{original=await ctx.read('99-章节摘要.md');}catch(error){if(error.code!=='ENOENT')throw error;}
      await atomic(path.join(root,'99-章节摘要.md'),mergeChapterSummaries(original,additions));
    }
    ctx.summaries=await collectSummaries(await fs.readdir(root),ctx.read);
  }
  for(const chapter of ctx.plan.chapters){
    if(!ctx.summaries.entries.has(chapter.chapterNumber))missingSummaries.push(chapter.chapterNumber);
    try{
      const info=await inspect(ctx,chapter),changed=chapter.validatedContentHash!==info.validatedContentHash||chapter.summaryHash!==info.summaryHash;
      Object.assign(chapter,info);
      if(chapter.status==='completed'&&(!info.wordCountPass||!info.summaryPass||changed))chapter.status='validating';
      if(!chapter.status||chapter.status==='pending')chapter.status='validating';
      if(!info.wordCountPass||!info.summaryPass||chapter.status==='failed')issues.push(chapter.chapterNumber);
    }catch{issues.push(chapter.chapterNumber);if(chapter.status!=='pending')chapter.status='failed';}
  }
  ctx.plan.status=ctx.plan.chapters.length&&ctx.plan.chapters.every(c=>c.status==='completed')?'completed':issues.length?'needs_attention':'validating';
  ctx.plan.updatedAt=new Date().toISOString();
  if(apply)await atomic(path.join(root,'02-写作计划.json'),JSON.stringify(ctx.plan,null,2)+'\n');
  return {applied:apply,backup,missingSummaries,conflicts,issues,status:ctx.plan.status,chapters:ctx.plan.chapters};
});}
