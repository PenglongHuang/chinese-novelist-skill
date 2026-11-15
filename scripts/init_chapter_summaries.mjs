#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

// Keep original character offsets so inserts never rewrite existing prose or notes.
function scanMarkdown(text){
  const chunks=text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g).filter(Boolean),found=[];
  let offset=0,fence=null,comment=false;
  for(const chunk of chunks){
    const start=offset;offset+=chunk.length;const line=chunk.replace(/^\uFEFF/,'').replace(/[\r\n]+$/,'');
    if(fence){const close=line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);if(close&&close[1][0]===fence[0]&&close[1].length>=fence.length)fence=null;continue;}
    let visible='',cursor=0;
    while(cursor<line.length){
      if(comment){const end=line.indexOf('-->',cursor);if(end<0)break;cursor=end+3;comment=false;}
      else{const begin=line.indexOf('<!--',cursor);if(begin<0){visible+=line.slice(cursor);break;}visible+=line.slice(cursor,begin);cursor=begin+4;comment=true;}
    }
    const marker=visible.match(/^ {0,3}(`{3,}|~{3,})/);if(marker){fence=marker[1];continue;}
    const h=visible.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);if(h)found.push({level:h[1].length,name:h[2],start,bodyStart:offset});
  }
  return {found,issues:[comment?'HTML 注释未闭合':null,fence?'Markdown 代码块未闭合':null].filter(Boolean)};
}
const headings=text=>scanMarkdown(text).found;
function sections(text){
  const found=headings(text);
  return found.flatMap((h,i)=>{
    const match=h.name.match(/^第\s*(\d+)\s*章[ \t:：-]*(.*)$/);if(!match)return [];
    const end=found.slice(i+1).find(next=>next.level<=h.level)?.start??text.length;
    return [{...h,number:Number(match[1]),title:match[2].trim(),end}];
  });
}
async function readOptional(file){
  try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('摘要路径必须为普通文件：'+file);return await fs.readFile(file,'utf8');}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function readPlan(root){
  const plan=JSON.parse((await fs.readFile(path.join(root,'02-写作计划.json'),'utf8')).replace(/^\uFEFF/,''));
  if(!Array.isArray(plan?.chapters)||!plan.chapters.length)throw new Error('写作计划必须有非空 chapters');
  const seen=new Set();
  for(const chapter of plan.chapters){
    if(!Number.isSafeInteger(chapter?.chapterNumber)||chapter.chapterNumber<1||seen.has(chapter.chapterNumber))throw new Error('计划章号必须为不重复的正整数');
    if(typeof chapter.title!=='string'||!chapter.title.trim()||/[\r\n\0]/.test(chapter.title))throw new Error('计划章节标题必须为非空单行文本');
    seen.add(chapter.chapterNumber);
  }
  if(plan.totalChapters!==undefined&&plan.totalChapters!==plan.chapters.length)throw new Error('totalChapters 与 chapters 数量不一致');
  return plan.chapters.map(c=>({number:c.chapterNumber,title:c.title.trim()})).sort((a,b)=>a.number-b.number);
}
function inspect(text,plan){
  const entries=sections(text),expected=new Map(plan.map(c=>[c.number,c])),seen=new Set(),issues=[...scanMarkdown(text).issues];
  for(const entry of entries){
    if(seen.has(entry.number))issues.push(`第${entry.number}章标题重复`);seen.add(entry.number);
    const chapter=expected.get(entry.number);
    if(!chapter)issues.push(`第${entry.number}章不在写作计划中`);
    else if(entry.title&&entry.title!==chapter.title)issues.push(`第${entry.number}章标题与计划不一致`);
  }
  return {entries,issues,missingHeadings:plan.filter(c=>!seen.has(c.number)).map(c=>c.number)};
}
function applyInserts(text,inserts){
  for(const edit of inserts.sort((a,b)=>b.at-a.at))text=text.slice(0,edit.at)+edit.text+text.slice(edit.at);
  return text;
}
function addMissing(text,plan){
  if(!text)text='# 章节摘要\n\n';
  const entries=sections(text),present=new Set(entries.map(e=>e.number)),newline=text.includes('\r\n')?'\r\n':'\n',groups=new Map();
  for(const chapter of plan){
    if(present.has(chapter.number))continue;
    const next=entries.find(e=>e.number>chapter.number),at=next?.start??entries[entries.length-1]?.end??text.length;
    const header=`## 第${String(chapter.number).padStart(2,'0')}章 ${chapter.title}${newline}${newline}`;
    groups.set(at,(groups.get(at)||'')+header);
  }
  return applyInserts(text,[...groups].map(([at,value])=>({at,text:(at&&!/[\r\n]$/.test(text.slice(0,at))?newline+newline:'')+value})));
}
async function execute(root){
  const plan=await readPlan(root),file=path.join(root,'99-章节摘要.md'),original=await readOptional(file);
  let text=original||'',state=inspect(text,plan),issues=[...state.issues],action='unchanged';
  if(!issues.length){
    text=addMissing(text,plan);
    const candidate=inspect(text,plan);issues.push(...candidate.issues,...candidate.missingHeadings.map(n=>`生成后仍缺少第${n}章标题，请检查计划标题中的 Markdown 标记`));
    if(!issues.length&&text!==original){await fs.writeFile(file,text,'utf8');action=original===null?'created':'updated';}
  }
  state=inspect(issues.length?original||'':text,plan);
  issues.push(...state.missingHeadings.map(n=>`缺少第${n}章标题`));
  return {project:root,file,action,chapters:plan.length,missingHeadings:state.missingHeadings,issues:[...new Set(issues)]};
}

const args=process.argv.slice(2),json=args.includes('--json');
if(args.includes('--help'))console.log('用法: node init_chapter_summaries.mjs <项目目录> [--json]\n读取02-写作计划.json，创建或补齐99-章节摘要.md的章标题，保留已有内容。\n退出码0=成功，1=框架冲突，2=参数或文件错误。');
else{
  try{
    if(!args[0]||args[0].startsWith('--')||args.slice(1).some(a=>a!=='--json'))throw new Error('参数无效，请使用 --help 查看用法');
    const root=await fs.realpath(path.resolve(args[0]));
    const result=await execute(root);
    console.log(json?JSON.stringify(result,null,2):`${result.file}\n${result.action} · ${result.chapters}章\n${result.issues.join('\n')||'框架初始化完成'}`);
    if(result.issues.length)process.exitCode=1;
  }catch(error){console.log(json?JSON.stringify({error:error.message}):'错误：'+error.message);process.exitCode=2;}
}
