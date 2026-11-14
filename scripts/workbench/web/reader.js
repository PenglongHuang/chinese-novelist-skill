import { escapeHtml as e } from './markdown.js';
import { href } from './views.js';

const memory=new Map();
export function readPreference(key,fallback) {
  try { const value=localStorage.getItem('novel-workbench:'+key);return value===null?fallback:JSON.parse(value); }
  catch { return memory.has(key)?memory.get(key):fallback; }
}
export function writePreference(key,value) { memory.set(key,value);try{localStorage.setItem('novel-workbench:'+key,JSON.stringify(value));}catch{} }
export function applyTypography() {
  const font=Number(readPreference('fontSize',18)),leading=Number(readPreference('lineHeight',2.1));
  document.documentElement.style.setProperty('--reader-size',`${Math.min(26,Math.max(15,font||18))}px`);
  document.documentElement.style.setProperty('--reader-leading',String(Math.min(2.6,Math.max(1.6,leading||2.1))));
}
export function controls(project,chapter,rawMode=false,isReading=false) {
  const available=project.chapters.filter(c=>c.exists);
  const index=chapter?available.findIndex(c=>c.id===chapter.id):-1;
  return {
    top:`<div class="document-top"><span class="muted">${chapter?`第 ${chapter.number??'?'} 章 / ${e(chapter.title)}`:e(project.title)}</span><div class="tools">${project.chapters.length?`<details id="chapter-picker"><summary>章节目录</summary><div class="chapter-list">${project.chapters.map(c=>c.exists?`<a href="${href(project.id,'read',c.id)}">第 ${c.number??'?'} 章　${e(c.title)}${c.unplanned?'（未列入计划）':''}</a>`:`<span class="unavailable">第 ${c.number??'?'} 章　${e(c.title)}（未生成）</span>`).join('')}</div></details>`:''}<button id="settings-toggle" aria-expanded="false" aria-controls="reading-settings">排版</button>${isReading?`<button id="source-toggle" aria-pressed="${rawMode}">${rawMode?'阅读稿':'原文件'}</button>`:''}</div></div><div id="reading-settings" class="reading-settings" hidden><label>字号 <input id="font-size" type="range" min="15" max="26" value="${Number(readPreference('fontSize',18))}"><output>${Number(readPreference('fontSize',18))}</output></label><label>行距 <input id="line-height" type="range" min="1.6" max="2.6" step="0.1" value="${Number(readPreference('lineHeight',2.1))}"><output>${Number(readPreference('lineHeight',2.1))}</output></label></div>`,
    bottom:chapter?`<div class="chapter-paging">${index>0?`<a id="previous-chapter" href="${href(project.id,'read',available[index-1].id)}">上一章</a>`:'<span class="unavailable">已是首章</span>'}<span class="muted">${index+1} / ${available.length} 个已有章节</span>${index<available.length-1?`<a id="next-chapter" href="${href(project.id,'read',available[index+1].id)}">下一章</a>`:'<span class="unavailable">已是末章</span>'}</div>`:'',
  };
}
export function enhanceDocument(container) {
  for(const table of container.querySelectorAll('table')) {const wrap=document.createElement('div');wrap.className='table-scroll';table.replaceWith(wrap);wrap.append(table);}
  const headings=[...container.querySelectorAll('h1[id],h2[id],h3[id]')];
  if(headings.length>1){const details=document.createElement('details');details.className='heading-directory';const summary=document.createElement('summary');summary.textContent='本文目录';details.append(summary);for(const h of headings){const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;a.dataset.headingLink='true';details.append(a);}container.before(details);}
}
