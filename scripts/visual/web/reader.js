import { escapeHtml as e } from './markdown.js';
import { href, inkbar } from './views.js';

const memory=new Map();
let preferenceScope='';
/* 排版偏好的单一事实源：默认值/范围/选项。settings.js（控件范围）、app.js（步进与 uiState）都从这张表取数；
   boot.js 因必须在首帧前以经典脚本执行无法 import，保留一份等值内联并以此表为准（改值两处同步）。 */
export const TYPOGRAPHY={
  readerFont:{values:['kai','song','hei'],default:'kai'},
  uiFont:{values:['kai','song','hei','system'],default:'kai'},
  appearance:{values:['light','dark','paper']},
  readerIndent:{default:true},
  fontSize:{min:15,max:26,default:18},
  lineHeight:{min:1.6,max:2.6,default:2.1,step:0.1},
  uiFontSize:{min:13,max:17,default:14},
  uiLineHeight:{min:1.5,max:2,default:1.7,step:0.1},
};
export function configurePreferenceScope(workspace){preferenceScope=workspace||'';}
const scopedKey=key=>/^(position|chapter):/.test(key)?preferenceScope+':'+key:key;
export function readPreference(key,fallback) {
  key=scopedKey(key);
  try { const value=localStorage.getItem('novel-workbench:'+key);return value===null?fallback:JSON.parse(value); }
  catch { return memory.has(key)?memory.get(key):fallback; }
}
export function writePreference(key,value) { key=scopedKey(key);memory.set(key,value);try{localStorage.setItem('novel-workbench:'+key,JSON.stringify(value));}catch{} }
/* 重置偏好：清掉本前缀下所有键（含各工作区阅读位置），只保留最近工作区与上次阅读的书 */
export function clearPreferences(){
  const keep=new Set(['recentWorkspaces','lastRead']);
  let removed=0;
  try{
    const prefix='novel-workbench:';
    for(let i=localStorage.length-1;i>=0;i--){
      const key=localStorage.key(i);
      if(!key||!key.startsWith(prefix))continue;
      const short=key.slice(prefix.length);
      const unscoped=preferenceScope&&short.startsWith(preferenceScope+':')?short.slice(preferenceScope.length+1):short;
      if(keep.has(short)||keep.has(unscoped))continue;
      localStorage.removeItem(key);memory.delete(key);removed++;
    }
  }catch{}
  return removed;
}
const clamp=(rule,value)=>Math.min(rule.max,Math.max(rule.min,Number(value)||rule.default));
export function applyTypography() {
  document.documentElement.style.setProperty('--reader-size',`${clamp(TYPOGRAPHY.fontSize,readPreference('fontSize',TYPOGRAPHY.fontSize.default))}px`);
  document.documentElement.style.setProperty('--reader-leading',String(clamp(TYPOGRAPHY.lineHeight,readPreference('lineHeight',TYPOGRAPHY.lineHeight.default))));
}
/* 字体两键（readerFont/uiFont）同一套逻辑：根元素 data-* 切 CSS 作用域，选项按钮同步 aria */
const applyFont=key=>{
  const rule=TYPOGRAPHY[key],font=readPreference(key,rule.default),attr=key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());
  document.documentElement.dataset[key]=rule.values.includes(font)?font:rule.default;
  document.querySelectorAll(`[data-${attr}]`).forEach(el=>{if(el.tagName==='BUTTON')el.setAttribute('aria-pressed',String(el.dataset[key]===font));});
};
export function applyReaderFont(){applyFont('readerFont');}
export function applyUiTypography(){
  document.documentElement.style.setProperty('--ui-size',`${clamp(TYPOGRAPHY.uiFontSize,readPreference('uiFontSize',TYPOGRAPHY.uiFontSize.default))}px`);
  document.documentElement.style.setProperty('--ui-leading',String(clamp(TYPOGRAPHY.uiLineHeight,readPreference('uiLineHeight',TYPOGRAPHY.uiLineHeight.default))));
}
export function applyUiFont(){applyFont('uiFont');}
export function applyReaderIndent(){
  document.documentElement.dataset.readerIndent=readPreference('readerIndent',TYPOGRAPHY.readerIndent.default)===false?'false':'true';
}

/* 阅读器工具栏（只留排版）+ 定位轨 + 排版弹层 + 章尾翻章 */
export function controls(project,chapter,isReading=false) {
  const available=project.chapters.filter(c=>c.exists);
  const index=chapter?available.findIndex(c=>c.id===chapter.id):-1;
  const prev=index>0?available[index-1]:null,next=index>=0&&index<available.length-1?available[index+1]:null;
  const fontSize=Number(readPreference('fontSize',TYPOGRAPHY.fontSize.default)),lineHeight=Number(readPreference('lineHeight',TYPOGRAPHY.lineHeight.default));
  const fonts=[['kai','楷体'],['song','宋体'],['hei','黑体']].map(([key,label])=>`<button type="button" data-reader-font="${key}" aria-pressed="false">${label}</button>`).join('');
  const typography=`<div id="reading-settings" class="popover" hidden><div class="field"><span class="field-label" id="reader-font-label">字体</span><span class="segmented small" role="group" aria-labelledby="reader-font-label">${fonts}</span></div><label class="field">字号<input data-type-slider="fontSize" type="range" min="${TYPOGRAPHY.fontSize.min}" max="${TYPOGRAPHY.fontSize.max}" value="${fontSize}"><output>${fontSize}</output></label><label class="field">行距<input data-type-slider="lineHeight" type="range" min="${TYPOGRAPHY.lineHeight.min}" max="${TYPOGRAPHY.lineHeight.max}" step="${TYPOGRAPHY.lineHeight.step}" value="${lineHeight}"><output>${lineHeight}</output></label></div>`;
  return {
    top:`<div class="reader-bar"><span class="reader-pos">${chapter?`第 ${chapter.number??'?'} 章 · ${e(chapter.title)} · ${index+1} / ${available.length}`:e(project.title)}</span><span class="grow"></span><button type="button" id="settings-toggle" class="ghost-btn" aria-expanded="false" aria-controls="reading-settings">排版</button>${typography}</div><div class="scroll-line" aria-hidden="true"><span id="scroll-line-fill"></span></div>${isReading&&project.chapters.length?inkbar(project,{interactive:true,rail:true,currentId:chapter?.id}):''}`,
    bottom:chapter?`<div class="chapter-paging">${prev?`<a class="page-link" href="${href(project.id,'read',prev.id)}"><small>上一章</small><span>第${prev.number??'?'}章 ${e(prev.title)}</span></a>`:`<span class="page-link none"><small>上一章</small><span>已是首章</span></span>`}<span class="page-count">${index+1} / ${available.length}</span>${next?`<a class="page-link forward" href="${href(project.id,'read',next.id)}"><small>下一章</small><span>第${next.number??'?'}章 ${e(next.title)}</span></a>`:`<span class="page-link none forward"><small>下一章</small><span>已是末章</span></span>`}</div>`:'',
  };
}

export function enhanceDocument(container) {
  for(const table of container.querySelectorAll('table')) {const wrap=document.createElement('div');wrap.className='table-scroll';table.replaceWith(wrap);wrap.append(table);}
  return [...container.querySelectorAll('h1[id],h2[id],h3[id]')];
}
