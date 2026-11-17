import { parseChapterSummaries, extractSection } from './web/documents.js';

export async function collectSummaries(files,read) {
  const entries=new Map(),conflicts=new Set();
  const sources=[{name:'99-章节摘要.md',kind:'canonical'},...files.filter(n=>/^_batch\d+-summaries\.md$/.test(n)).sort().map(name=>({name,kind:'batch'})),{name:'01-大纲.md',kind:'legacy'}];
  for(const source of sources) {
    let text;try{text=await read(source.name);}catch{continue;}
    if(source.kind==='legacy'){const section=extractSection(text,['章节摘要']);if(!section.found)continue;text=section.markdown;}
    for(const item of parseChapterSummaries(text)) {
      const prior=entries.get(item.number);
      if(prior){if(prior.kind===source.kind&&prior.body!==item.body)conflicts.add(item.number);continue;}
      entries.set(item.number,{...item,...source});
    }
  }
  return {entries,conflicts};
}

export function inspectStatus(chapter,minimum) {
  const issues=[];
  if(chapter.exists&&(!chapter.recordedStatus||chapter.recordedStatus==='pending'))issues.push('正文已存在，计划状态未同步');
  if(!chapter.exists&&chapter.recordedStatus&&chapter.recordedStatus!=='pending')issues.push('计划有进度，但正文文件缺失');
  if(chapter.recordedStatus==='completed') {
    if(chapter.actualWordCountPass===false)issues.push('字数未达到完成门槛');
    if(chapter.wordCount!==null&&chapter.wordCount!==undefined&&chapter.actualWordCount!==null&&chapter.wordCount!==chapter.actualWordCount)issues.push('字数记录未同步');
  }
  return {syncIssues:issues,effectiveStatus:issues.length?'needs_sync':chapter.recordedStatus||'pending'};
}
