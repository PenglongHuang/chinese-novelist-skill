#!/usr/bin/env node
import { updateChapter, reconcileProject } from '../visual/state.mjs';
const args=process.argv.slice(2),value=key=>{const n=args.indexOf(key);return n<0?null:args[n+1];};
if(args.includes('--help'))console.log('用法: node chapter-state.mjs --project "小说目录" --chapter 1 --status in_progress|validating|completed|failed\n汇总校对（默认只报告）: --project "小说目录" --reconcile [--apply]\n--apply 会备份元数据、合并已有摘要并回填计数，不自动将旧章节标为已完成。');
else try{
  const project=value('--project');if(!project)throw new Error('需要 --project');
  let result;
  if(args.includes('--reconcile')){
    result=await reconcileProject(project,{apply:args.includes('--apply')});
  }else{
    const chapterRaw=value('--chapter'),chapter=Number(chapterRaw);
    if(!Number.isSafeInteger(chapter)||chapter<1)throw new Error('--chapter 必须为正整数，收到 "'+chapterRaw+'"');
    result=await updateChapter(project,chapter,value('--status'));
  }
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
