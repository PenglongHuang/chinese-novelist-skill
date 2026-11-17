function headings(markdown) {
  const lines=markdown.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const found=[];let fence=null,comment=false;
  for(let i=0;i<lines.length;i++) {
    if(fence){
      const marker=lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if(marker&&marker[1][0]===fence[0]&&marker[1].length>=fence.length)fence=null;
      continue;
    }
    let visible='',cursor=0;
    while(cursor<lines[i].length){
      if(comment){const end=lines[i].indexOf('-->',cursor);if(end<0)break;cursor=end+3;comment=false;}
      else{const start=lines[i].indexOf('<!--',cursor);if(start<0){visible+=lines[i].slice(cursor);break;}visible+=lines[i].slice(cursor,start);cursor=start+4;comment=true;}
    }
    const marker=visible.match(/^ {0,3}(`{3,}|~{3,})/);
    if(marker){fence=marker[1];continue;}
    const heading=visible.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
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
  /* 单一事实源：跳过首个「#…章」标题行，剥 Markdown 标记后数汉字。
     skill CLI（check_chapter_wordcount.mjs）与书房实测、章节状态校验共用此函数。 */
  const lines=markdown.split('\n');
  const heading=lines.findIndex(line=>line.startsWith('#')&&line.includes('章'));
  const text=lines.slice(heading<0?0:heading+1).join('\n')
    .replace(/#{1,6}\s*/g,'').replace(/\*\*(.*?)\*\*/g,'$1')
    .replace(/\*(.*?)\*/g,'$1').replace(/~~(.*?)~~/g,'$1')
    .replace(/`(.*?)`/g,'$1').replace(/\[(.*?)\]\(.*?\)/g,'$1');
  return (text.match(/[一-鿿]/g)||[]).length;
}

function summarySections(markdown) {
  const {lines,found}=headings(markdown);
  const chapters=found.filter(h=>/^第\s*\d+\s*章/.test(h.name));
  return chapters.map(h=>{
    const end=found.find(next=>next.line>h.line&&next.level<=h.level)?.line??lines.length;
    const body=lines.slice(h.line+1,end).join('\n').trim();
    return {number:Number(h.name.match(/^第\s*(\d+)/)[1]),title:h.name,body,line:h.line,endLine:end};
  });
}
const summaryFields=['关键事件与后果','人物当前处境','行动条件与未了事项'];
function fieldSections(markdown){
  const {lines,found}=headings(markdown);
  return found.filter(h=>summaryFields.includes(h.name)).map(h=>{
    const endLine=found.find(next=>next.line>h.line&&next.level<=h.level)?.line??lines.length;
    return {...h,body:lines.slice(h.line+1,endLine).join('\n').trim()};
  });
}
function hasSubstantiveText(body){
  const text=body.replace(/<!--[\s\S]*?(?:-->|$)/g,'').split('\n')
    .filter(line=>!/^ {0,3}(?:#{1,6}\s|`{3,}|~{3,})/.test(line))
    .map(line=>line.replace(/^[\s>*+\-]+/,'').replace(/[*_`]/g,'').trim())
    .filter(line=>! /^(?:[\[【（(]?\s*(?:待(?:填写|补充|生成|写入)(?:(?:本章)?(?:摘要|内容|事件(?:与后果)?|正文))?|在此填写(?:本章)?(?:摘要|内容|事件(?:与后果)?|正文)?)\s*[\]】）)]?|无新增|暂无|无|同上|略)[。….！!]*$/.test(line))
    .join('').replace(/[\s#*_\-`>\[\]：:。….,，;；]/g,'');
  return text.length>0;
}
function hasSummaryContent(body) {
  const fields=fieldSections(body);
  return fields.length?hasSubstantiveText(fields.find(f=>f.name===summaryFields[0])?.body||''):hasSubstantiveText(body);
}
export function parseChapterSummaries(markdown) {
  return summarySections(markdown).filter(entry=>hasSummaryContent(entry.body)).map(({number,title,body})=>({number,title,body,markdown:'## '+title+'\n\n'+body}));
}

function lineOffsets(markdown){
  const chunks=markdown.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g).filter(Boolean),offsets=[0];
  for(const chunk of chunks)offsets.push(offsets[offsets.length-1]+chunk.length);
  return {chunks,offsets};
}
function fillSummarySection(original,addition,newline){
  const slots=fieldSections(original),incoming=fieldSections(addition);
  const normalize=text=>text.trim().replace(/\r\n?|\n/g,newline);
  if(!slots.length)return original+(original.endsWith(newline+newline)?'':original.endsWith(newline)?newline:newline+newline)+normalize(addition)+newline+newline;
  const {chunks,offsets}=lineOffsets(original),edits=[],append=[];
  for(const field of incoming.length?incoming:[{name:summaryFields[0],body:addition}]){
    if(!hasSubstantiveText(field.body))continue;
    const slot=slots.find(s=>s.name===field.name);
    if(slot){
      if(hasSubstantiveText(slot.body))continue;
      const separator=/[\r\n]$/.test(chunks[slot.line])?newline:newline+newline;
      edits.push({at:offsets[slot.line+1],text:separator+normalize(field.body)+newline});
    }else append.push('### '+field.name+newline+newline+normalize(field.body));
  }
  let filled=original;
  // Insert into empty fields, retaining author notes, comments and unknown sections verbatim.
  for(const edit of edits.sort((a,b)=>b.at-a.at))filled=filled.slice(0,edit.at)+edit.text+filled.slice(edit.at);
  if(append.length)filled+=(filled.endsWith(newline+newline)?'':filled.endsWith(newline)?newline:newline+newline)+append.join(newline+newline)+newline+newline;
  return filled;
}
export function mergeChapterSummaries(markdown, additions) {
  const sections=summarySections(markdown),valid=new Set(sections.filter(e=>hasSummaryContent(e.body)).map(e=>e.number));
  const {offsets}=lineOffsets(markdown);
  const newline=markdown.includes('\r\n')?'\r\n':'\n',edits=[],append=[];
  for(const entry of additions){
    if(valid.has(entry.number)||!hasSummaryContent(entry.body))continue;
    valid.add(entry.number);
    const slot=sections.find(e=>e.number===entry.number);
    const body=entry.body.trim().replace(/\r\n?|\n/g,newline);
    if(slot){
      const start=offsets[slot.line+1],end=offsets[slot.endLine]??markdown.length;
      edits.push({start,end,text:fillSummarySection(markdown.slice(start,end),entry.body,newline)});
    }else append.push('## '+entry.title+newline+newline+body);
  }
  let merged=markdown;
  for(const edit of edits.sort((a,b)=>b.start-a.start))merged=merged.slice(0,edit.start)+edit.text+merged.slice(edit.end);
  if(append.length)merged+=(merged.endsWith(newline+newline)?'':merged.endsWith(newline)?newline:newline+newline)+append.join(newline+newline)+newline;
  return merged;
}
