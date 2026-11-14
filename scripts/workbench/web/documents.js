function headings(markdown) {
  const lines=markdown.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const found=[];let fence=null;
  for(let i=0;i<lines.length;i++) {
    const marker=lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if(marker){
      if(!fence)fence=marker[1];
      else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length&&/^ {0,3}(?:`{3,}|~{3,})\s*$/.test(lines[i]))fence=null;
      continue;
    }
    if(fence)continue;
    const heading=lines[i].match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if(heading)found.push({line:i,level:heading[1].length,name:heading[2]});
  }
  return {lines,found};
}
export function extractSection(markdown,names) {
  const {lines,found}=headings(markdown);
  const index=found.findIndex(h=>names.includes(h.name.replace(/[*_]/g,'')));
  if(index<0)return {markdown,found:false};
  const current=found[index],end=found.slice(index+1).find(h=>h.level<=current.level)?.line??lines.length;
  return {markdown:lines.slice(current.line,end).join('\n'),found:true};
}
export function extractReadingContent(markdown) {
  const {lines,found}=headings(markdown);
  const title=found.find(h=>h.level===1&&/章/.test(h.name));
  const summary=found.find(h=>h.level===2&&h.name==='本章概要');
  const body=found.find(h=>h.level===2&&h.name==='正文');
  if(!title||!summary||!body||summary.line<title.line||body.line<summary.line)return {markdown,mode:'full',notice:summary||body?'无法确定模板边界，保留完整文档。':''};
  const intro=found.find(h=>h.level===2&&h.name==='章首引子'&&h.line>summary.line&&h.line<body.line);
  const notes=found.find(h=>h.level===2&&h.name==='章节备注'&&h.line>body.line);
  const trim=lines=>lines.join('\n').trim().replace(/(?:^---\s*\n|\n\s*---$)/g,'').trim();
  const parts=[lines[title.line]];
  if(intro)parts.push(trim(lines.slice(intro.line+1,body.line)));
  parts.push(trim(lines.slice(body.line+1,notes?.line??lines.length)));
  return {markdown:parts.filter(Boolean).join('\n\n'),mode:'reading',notice:''};
}

export function countNarrative(markdown) {
  const extracted=extractReadingContent(markdown);
  const text=extracted.markdown.replace(/^ {0,3}#{1,6}\s+.*$/gm,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'');
  return {wordCount:(text.match(/[一-鿿]/g)||[]).length,mode:extracted.mode};
}

export function parseChapterSummaries(markdown) {
  const {lines,found}=headings(markdown);
  const chapters=found.filter(h=>/^第\s*\d+\s*章/.test(h.name));
  return chapters.map(h=>{
    const end=found.find(next=>next.line>h.line&&next.level<=h.level)?.line??lines.length;
    const body=lines.slice(h.line+1,end).join('\n').trim();
    return {number:Number(h.name.match(/^第\s*(\d+)/)[1]),title:h.name,body,markdown:'## '+h.name+'\n\n'+body};
  }).filter(entry=>entry.body.replace(/[\s#*_\-]/g,'').length>0);
}
