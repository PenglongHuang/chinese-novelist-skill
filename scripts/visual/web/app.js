import { renderMarkdown } from './markdown.js';
import { extractReadingContent, extractSection } from './documents.js';
import { shelf, navigation, sidebarBooks, bookHeader, empty, progress, href, viewNames, tabViews, docSubTabs, docSubs, summaryCoverage, tocChapters } from './views.js';
import { controls, enhanceDocument, applyTypography, applyReaderFont, applyUiFont, applyUiTypography, applyReaderIndent, readPreference, writePreference, configurePreferenceScope, clearPreferences, TYPOGRAPHY } from './reader.js';
import { settingsRail, workspacePanel, typographyPanel, workspaceFooter, settingsHead, clientPreferences, editablePayload, chipHtml, addButtonHtml } from './settings.js';
import { reportView, reportLoading } from './report.js';

const q=selector=>document.querySelector(selector);
let snapshot={projects:[],warnings:[],version:''},current=null,requestNumber=0,controller=null,events=null,refreshPromise=null;
let restoreScroll=true;
/* 站内点链接跳转（翻章/目录/页签）一律从页顶开始；只有刷新、后退、直接改 URL 才恢复阅读位置 */
let landedViaClick=false;
let shelfPage=1;
let catalogEpoch=0,refreshQueued=false,switchingWorkspace=false;
const progressFilters=new Map();
const progressPages=new Map();
let lastChanges={projects:new Set(),docs:new Map()};
function progressPage(project,changedDocs=null){
  const mark=readPreference('lastRead',null);
  return progress(project,progressFilters.get(project.id)||'all',changedDocs,progressPages.get(project.id)||1,10,mark&&mark.projectId===project.id?mark.chapterId:null);
}
/* 首次进入进度页时把分页定位到「上次读到」那一章，让标记看得见 */
function locateProgressPage(project){
  const mark=readPreference('lastRead',null);
  if(!mark||mark.projectId!==project.id||progressFilters.get(project.id)&&progressFilters.get(project.id)!=='all')return;
  const index=project.chapters.findIndex(c=>c.id===mark.chapterId);
  if(index>=0)progressPages.set(project.id,Math.floor(index/10)+1);
}

/* 明暗纸黄三态；顶栏图标只切明暗，纸黄在设置里选；首次访问跟随系统偏好 */
function applyAppearance(){
  let appearance=readPreference('appearance',null);
  if(!TYPOGRAPHY.appearance.values.includes(appearance))appearance=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  document.documentElement.dataset.appearance=appearance;
  q('#appearance-toggle')?.classList.toggle('is-dark',appearance==='dark');
  document.querySelectorAll('[data-appearance-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.appearanceChoice===appearance)));
}
function toggleAppearance(){
  const next=document.documentElement.dataset.appearance==='dark'?'light':'dark';
  writePreference('appearance',next);applyAppearance();
}
function workspaceInfo(){
  q('.ws-path').textContent=snapshot.workspace||'';
  const stored=readPreference('recentWorkspaces',[]),prior=Array.isArray(stored)?stored.filter(p=>typeof p==='string'):[];
  const recent=[...new Set([snapshot.workspace,...prior].filter(Boolean))].slice(0,8);writePreference('recentWorkspaces',recent);
  q('#recent-workspaces').replaceChildren(...recent.map(path=>{const button=document.createElement('button');button.dataset.recentWorkspace=path;button.textContent=path;return button;}));
}
function route() {
  try {
    const match=location.hash.match(/^#\/projects\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if(!match)return null;
    const id=decodeURIComponent(match[1]),raw=decodeURIComponent(match[2]),third=match[3]?decodeURIComponent(match[3]):undefined;
    /* 旧版视图链接（大纲/人物/摘要等）一次性映射到创作资料汇总的对应子页 */
    if(docSubs.includes(raw))return {id,view:'docs',doc:raw,sub:raw};
    const view=Object.hasOwn(viewNames,raw)?raw:'progress';
    const sub=view==='docs'?(docSubs.includes(third)?third:'people'):null;
    return {id,view,doc:third,sub};
  }catch{return null;}
}
async function api(url,{signal,method='GET',headers,body}={}) {
  const response=await fetch(url,{signal,method,headers,body});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'读取失败，请重试。');
  return data;
}
function lastReading(){
  const rec=readPreference('lastRead',null);
  if(rec&&typeof rec==='object'){
    const p=snapshot.projects.find(x=>x.id===rec.projectId);
    const c=p?.chapters.find(c=>c.id===rec.chapterId&&c.exists);
    if(p&&c)return {project:p,chapter:c,href:href(p.id,'read',c.id),remembered:true};
  }
  const p=snapshot.projects[0];
  if(!p)return null;
  const c=p.chapters.find(c=>c.exists);
  return c?{project:p,chapter:c,href:href(p.id,'read',c.id),remembered:false}:null;
}
function shell(project,r) {
  const inBook=!!project,view=r?.view;
  q('#book-list').innerHTML=sidebarBooks(snapshot.projects,project?.id,view||'progress');
  q('#book-header').hidden=!inBook;
  if(inBook)q('#book-header').innerHTML=bookHeader(project);
  q('#navigation').hidden=!inBook;
  if(inBook)q('#navigation').innerHTML=navigation(project,view);
  q('#doc-tabs').hidden=!(inBook&&view==='docs');
  if(inBook&&view==='docs')q('#doc-tabs').innerHTML=docSubTabs.map(([key,label])=>`<a class="doc-tab" href="${href(project.id,'docs',key)}"${key===r.sub?' aria-current="true"':''}>${label}</a>`).join('');
  q('#mobile-tabs').hidden=!inBook;
  if(inBook)q('#mobile-tabs').innerHTML=navigation(project,view);
  q('#project-notices').textContent=project?.warnings.join(' ')||'';
  document.title=project?`${project.title} · 小说书房`:'工作区作品 · 小说书房';
}
function setReload(value) {q('#doc-updated').hidden=!value;}
function saveScroll(){if(current?.key)writePreference('position:'+current.key,window.scrollY);}
function restorePosition(key,go=true) {
  if(!go)return;
  requestAnimationFrame(()=>{if((current?.key||location.hash)===key)scrollTo(0,Number(readPreference('position:'+key,0))||0);});
}
async function display({reload=false}={}) {
  const ticket=++requestNumber;
  const viaClick=landedViaClick;landedViaClick=false;
  controller?.abort();controller=new AbortController();
  const signal=controller.signal,r=route();
  const project=r?snapshot.projects.find(p=>p.id===r.id):null;
  const oldKey=current?.key;
  setReload(false);closeDrawer();closeReadingSettings();
  shell(project,r);q('#content').classList.remove('reading');
  if(!r){current=null;q('#content').innerHTML=shelf(snapshot.projects,snapshot.warnings,shelfPage,lastReading(),lastChanges.projects);lastChanges={projects:new Set(),docs:new Map()};if(viaClick)scrollTo(0,0);else if(restoreScroll)restorePosition(location.hash);return;}
  if(!project){current=null;q('#content').innerHTML=empty('作品不存在或已被移除','请返回书架，查看当前工作区内的作品。');return;}
  if(r.view==='progress'){current={key:location.hash,projectId:r.id,view:'progress'};const changed=lastChanges.docs.get(r.id)||null;lastChanges={projects:new Set(),docs:new Map()};if(viaClick)locateProgressPage(project);q('#content').innerHTML=progressPage(project,changed);if(viaClick)scrollTo(0,0);return;}
  if(r.view==='report'){
    current={key:location.hash,projectId:r.id};
    lastChanges={projects:new Set(),docs:new Map()};
    clearDocToc();
    q('#content').innerHTML=reportLoading();
    try{
      const data=await api(`/api/projects/${r.id}/analysis`,{signal});
      if(ticket!==requestNumber)return;
      q('#content').innerHTML=reportView(project,data.report);
    }catch(error){
      if(error.name==='AbortError'||ticket!==requestNumber)return;
      q('#content').innerHTML=empty('审读暂不可用',error.message)+'<button id="retry-document" class="ghost-btn">重新读取</button>';
    }
    /* 报告页永远从顶部进入：阅读位置的恢复语义不适用于体检报告 */
    scrollTo(0,0);
    return;
  }
  let chapter=null,docId=r.view;
  const sub=r.sub;
  if(r.view==='read') {
    const preferred=r.doc||readPreference('chapter:'+r.id,null);
    chapter=project.chapters.find(c=>c.id===preferred&&c.exists);
    if(r.doc&&!chapter){current={key:location.hash,projectId:r.id};q('#content').innerHTML=empty('章节不存在或已移除','当前链接对应的章节已不在作品目录中。请从目录重新选择章节。',`<a class="solid-btn" href="${href(r.id,'progress')}">查看本书章节列表</a>`);return;}
    if(!chapter)chapter=project.chapters.find(c=>c.exists);
    if(!chapter){current={key:location.hash,projectId:r.id};q('#content').innerHTML=empty('小说正文尚未生成','章节文件生成后将出现在目录中。你可以先查看大纲、人物与文风资料。');return;}
    if(!r.doc)history.replaceState(null,'',href(r.id,'read',chapter.id));
    writePreference('chapter:'+r.id,chapter.id);
    writePreference('lastRead',{projectId:r.id,chapterId:chapter.id});
    docId=chapter.id;
  }
  if(r.view==='docs')docId=sub==='facts'?'outline':sub==='summaries'?'summary-view':sub;
  const info=docId==='summary-view'?{exists:true,version:project.summaryVersion,fileName:'章节摘要汇总视图'}:chapter||project.documents.find(d=>d.id===docId);
  if(!info?.exists&&!(current?.projectId===r.id&&current?.docId===docId&&current?.version)){
    current={key:location.hash,projectId:r.id,docId};
    const subLabel=r.view==='docs'?(docSubTabs.find(([key])=>key===sub)?.[1]||'资料'):(viewNames[r.view]||'资料');
    q('#content').innerHTML=empty('资料尚未生成',`此作品还没有可读取的${subLabel}资料。文件生成后会自动发现，也可以先查看其他资料。`);
    return;
  }
  const key=location.hash;
  try {
    const data=await api(`/api/projects/${r.id}/documents/${docId}`,{signal});
    if(ticket!==requestNumber)return;
    current={key,projectId:r.id,docId,version:data.version,chapterId:chapter?.id};
    let markdown=data.text,notice='';
    if(r.view==='read'){const extracted=extractReadingContent(markdown);markdown=extracted.markdown.replace(/^(#\s*第)0+(\d+)(章)/,'$1$2$3');notice=extracted.notice;}
    if(sub==='facts'){const section=extractSection(markdown,['设定与事实词典','设定词典']);markdown=section.markdown;if(!section.found)notice='未找到独立词典区，显示完整大纲。';else notice='设定词典包含完整真相，可能涉及剧透。';}
    if(docId==='summary-view'&&!project.summaryCoverage?.available)notice='暂无有效章节摘要，当前文件可能只有模板说明。摘要需要由写作 Agent 收尾保存。';
    function routeForDocument(target) {
      let file=target;try{file=decodeURIComponent(target.split('#')[0]);}catch{return null;}
      file=file.replace(/^\.\//,'');
      const doc=project.documents.find(d=>d.fileName===file&&d.exists);
      if(doc&&viewNames[doc.id])return href(r.id,doc.id);
      const linked=project.chapters.find(c=>c.fileName===file&&c.exists);
      return linked?href(r.id,'read',linked.id):null;
    }
    const rendered=renderMarkdown(markdown,{projectId:r.id,assets:data.assets,routeForDocument});
    const inRead=r.view==='read';
    const frame=controls(project,chapter,inRead);
    q('#content').classList.toggle('reading',inRead);
    const head=(inRead?frame.top:'')+(docId==='summary-view'?summaryCoverage(project):'');
    q('#content').innerHTML=head+'<p id="document-notice" class="muted document-top"></p><article class="markdown"></article>'+(inRead?frame.bottom:'');
    const noticeEl=q('#document-notice');
    noticeEl.textContent=[notice,...data.warnings].filter(Boolean).join(' ');
    if(!noticeEl.textContent)noticeEl.hidden=true;
    q('.markdown').innerHTML=rendered;
    const headings=enhanceDocument(q('.markdown'));
    current.headings=headings;
    if(inRead)buildReaderSidebar(project,chapter,headings);
    else if(r.view==='docs'){buildDocTocAside(headings);linkifyChapters(q('.markdown'),project);}
    else clearDocToc();
    applyTypography();applyReaderFont();updateScrollLine();
    if(reload)scrollTo(0,Number(readPreference('position:'+key,0))||0);
    else if(viaClick)scrollTo(0,0);
    else restorePosition(key,restoreScroll);
  } catch(error) {
    if(error.name==='AbortError'||ticket!==requestNumber)return;
    q('#content').innerHTML=empty('资料暂不可读',error.message)+'<button id="retry-document" class="ghost-btn">重新读取</button>';
  }
}
function refresh() {
  if(switchingWorkspace){refreshQueued=true;return refreshPromise||Promise.resolve();}
  if(refreshPromise){refreshQueued=true;return refreshPromise;}
  const epoch=catalogEpoch;
  const pending=(async()=>{
    const updated=await api('/api/projects'),rootChanged=snapshot.workspace&&updated.workspace!==snapshot.workspace;
    if(epoch!==catalogEpoch||switchingWorkspace)return;
    if(rootChanged){saveScroll();controller?.abort();current=null;shelfPage=1;history.replaceState(null,'','#/');configurePreferenceScope(updated.workspace);progressFilters.clear();}
    snapshot=updated;workspaceInfo();
    if(snapshot.restartCommand)q('#restart-command').textContent=snapshot.restartCommand;
    const changed=lastChanges;lastChanges={projects:new Set(),docs:new Map()};
    const r=route();
    if(!r){const y=scrollY;q('#content').innerHTML=shelf(snapshot.projects,snapshot.warnings,shelfPage,lastReading(),changed.projects);scrollTo(0,y);shell(null,null);return;}
    const project=snapshot.projects.find(p=>p.id===r.id);
    if(!project){await display();return;}
    shell(project,r);
    if(r.view==='progress'){q('#content').innerHTML=progressPage(project,changed.docs.get(r.id)||null);return;}
    if(r.view==='report'){
      /* 他书/无关变化不打断读报告；本书确有变化才重算，且保住滚动位置与已展开的参考块 */
      if(current?.projectId===r.id&&!changed.projects.has(r.id)&&!changed.docs.has(r.id))return;
      const y=scrollY,openNotes=new Set([...q('#content').querySelectorAll('details[open]>summary')].map(s=>s.textContent));
      await display();
      scrollTo(0,y);
      for(const d of q('#content').querySelectorAll('details')){const s=d.querySelector('summary');if(s&&openNotes.has(s.textContent))d.open=true;}
      return;
    }
    if(!current?.version){await display();return;}
    const doc=current.docId==='summary-view'?{version:project.summaryVersion}:project.documents.find(d=>d.id===current.docId)||project.chapters.find(c=>c.id===current.docId);
    if(!doc||doc.version!==current.version)setReload(true);
  })().finally(()=>{
    if(refreshPromise===pending)refreshPromise=null;
    if(refreshQueued&&!switchingWorkspace){refreshQueued=false;refresh().catch(()=>{});}
  });
  refreshPromise=pending;return pending;
}
function connect() {
  events?.close();events=new EventSource('/api/events');
  const setStatus=state=>{const el=q('#connection');el.classList.toggle('on',state==='on');el.classList.toggle('off',state==='off');};
  events.onopen=()=>{setStatus('on');q('#connection .conn-text').textContent='已连接';q('#connection-help').hidden=true;};
  events.onerror=()=>{setStatus('off');q('#connection .conn-text').textContent='重连中';q('#connection-help').hidden=false;};
  events.addEventListener('catalog',event=>{
    try{
      const value=JSON.parse(event.data);
      const incoming={
        projects:Array.isArray(value.changedProjects)?value.changedProjects:[],
        docs:(Array.isArray(value.changedDocuments)?value.changedDocuments:[]).reduce((map,entry)=>{
          if(typeof entry!=='string')return map;
          const at=entry.indexOf('/');
          if(at<=0)return map;
          const pid=entry.slice(0,at),doc=entry.slice(at+1);
          if(!map.has(pid))map.set(pid,new Set());
          map.get(pid).add(doc);return map;
        },new Map()),
      };
      if(incoming.projects.length||incoming.docs.size){
        const projects=new Set(lastChanges.projects);for(const p of incoming.projects)projects.add(p);
        const docs=new Map(lastChanges.docs);
        for(const[pid,set]of incoming.docs){const merged=docs.get(pid)||new Set();for(const d of set)merged.add(d);docs.set(pid,merged);}
        lastChanges={projects,docs};
      }
      if(value.version!==snapshot.version)refresh().catch(()=>{});
    }catch{/* Invalid notifications never replace readable content. */}
  });
}
/* 阅读右栏（≥1240px 常驻，固定贴右缘）：章节目录 + 文内目录（滚动高亮） */
let tocSpy=null;
function clearDocToc(){
  document.querySelector('.doc-toc')?.remove();
  tocSpy?.disconnect();tocSpy=null;
}
/* 排版弹层收起（含 aria 同步）；refocus=Escape 收起时把焦点还给触发钮 */
function closeReadingSettings(refocus=false){
  const panel=q('#reading-settings');
  if(!panel||panel.hidden)return;
  panel.hidden=true;
  const toggle=q('#settings-toggle');
  toggle?.setAttribute('aria-expanded','false');
  if(refocus)toggle?.focus();
}
function attachTocSpy(aside){
  tocSpy?.disconnect();tocSpy=null;
  const links=new Map();for(const a of aside.querySelectorAll('.toc-head-link'))links.set(a.dataset.tocFor,a);
  const targets=[...links.keys()].map(id=>document.getElementById(id)).filter(Boolean);
  if(!targets.length)return;
  const setCurrent=id=>{for(const[key,a]of links)a.classList.toggle('current',key===id);};
  let currentId=targets[0].id;setCurrent(currentId);
  tocSpy=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting)currentId=entry.target.id;
    setCurrent(currentId);
  },{rootMargin:'-8% 0px -78% 0px'});
  targets.forEach(t=>tocSpy.observe(t));
}
/* 文内目录链接：按标题层级挂 lv2/lv3 类缩进（导轨不动、文字退层级） */
const headLink=h=>{
  const a=document.createElement('a');
  a.href='#'+h.id;a.textContent=h.textContent;
  a.dataset.headingLink='true';a.dataset.tocFor=h.id;
  a.className='toc-head-link'+(h.tagName==='H2'?' lv2':h.tagName==='H3'?' lv3':'');
  return a;
};
function buildReaderSidebar(project,chapter,headings){
  clearDocToc();
  const article=q('.markdown');
  if(!article)return;
  const aside=document.createElement('aside');aside.className='doc-toc';aside.setAttribute('aria-label','阅读目录');
  const label=document.createElement('p');label.className='doc-toc-title';label.textContent='章节目录';aside.append(label);
  const wrap=document.createElement('div');
  wrap.innerHTML=tocChapters(project,chapter?.id||null);
  for(const node of [...wrap.children])aside.append(node);
  if(headings&&headings.length>1){
    const second=document.createElement('p');second.className='doc-toc-title';second.textContent='文内目录';aside.append(second);
    for(const h of headings)aside.append(headLink(h));
  }
  article.after(aside);attachTocSpy(aside);
  aside.querySelector('[aria-current]')?.scrollIntoView({block:'center'});
}
/* 创作资料里的「第N章」字样链到对应正文：摘要/大纲与正文的互通入口 */
function linkifyChapters(container,project){
  const numbers=new Map(project.chapters.filter(c=>c.exists&&Number.isInteger(c.number)).map(c=>[c.number,c]));
  if(!numbers.size)return;
  const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT,{
    acceptNode(node){const parent=node.parentElement;return parent&&!parent.closest('a,code,pre,h1,h2,h3,h4,h5,h6')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;},
  });
  const targets=[];
  for(let node=walker.nextNode();node;node=walker.nextNode())if(/第\s*\d+\s*章/.test(node.nodeValue))targets.push(node);
  for(const node of targets){
    const text=node.nodeValue,fragment=document.createDocumentFragment();
    let last=0,linked=false;
    for(const match of text.matchAll(/第\s*(\d+)\s*章/g)){
      const chapter=numbers.get(Number(match[1]));
      if(!chapter)continue;
      fragment.append(document.createTextNode(text.slice(last,match.index)));
      const anchor=document.createElement('a');
      anchor.href=href(project.id,'read',chapter.id);
      anchor.textContent=match[0];
      anchor.className='chapter-ref';
      fragment.append(anchor);
      last=match.index+match[0].length;linked=true;
    }
    if(!linked)continue;
    fragment.append(document.createTextNode(text.slice(last)));
    node.replaceWith(fragment);
  }
}
/* 创作资料：与正文一致的右侧文内目录 */
function buildDocTocAside(headings){
  clearDocToc();
  const article=q('.markdown');
  if(!article||!headings||headings.length<2)return;
  const aside=document.createElement('aside');aside.className='doc-toc';aside.setAttribute('aria-label','文内目录');
  const label=document.createElement('p');label.className='doc-toc-title';label.textContent='文内目录';aside.append(label);
  for(const h of headings)aside.append(headLink(h));
  article.after(aside);attachTocSpy(aside);
}
/* 侧栏：桌面两字微缩折叠（记忆偏好），窄屏为抽屉 */
function applySidebarCollapsed(){
  const collapsed=innerWidth>=1024&&!!readPreference('sidebarCollapsed',false);
  document.documentElement.classList.toggle('sidebar-collapsed',collapsed);
  const toggle=q('#sidebar-toggle');
  if(toggle){toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'展开导航':'收起导航');}
  closeDrawer();/* 跨断点 resize 时清掉抽屉残留，避免回窄屏突然弹出 */
}
function openDrawer(){q('#sidebar').classList.add('open');q('#sidebar-backdrop').hidden=false;q('#nav-toggle').setAttribute('aria-expanded','true');q('.brand')?.focus();}
function closeDrawer(returnFocus=false){const sidebar=q('#sidebar');if(!sidebar.classList.contains('open'))return;sidebar.classList.remove('open');q('#sidebar-backdrop').hidden=true;q('#nav-toggle').setAttribute('aria-expanded','false');if(returnFocus)q('#nav-toggle').focus();}
let scrollLineQueued=false,lastScrollPercent=-1;
function updateScrollLine(){
  /* rAF 合帧＋百分比取整不变不写，滚动热路径上避免强制重排 */
  if(scrollLineQueued)return;
  scrollLineQueued=true;
  requestAnimationFrame(()=>{
    scrollLineQueued=false;
    const fill=q('#scroll-line-fill');
    if(!fill){lastScrollPercent=-1;return;}
    const max=document.documentElement.scrollHeight-innerHeight;
    const percent=max>0?Math.min(100,Math.max(0,Math.round(scrollY/max*100))):0;
    if(percent!==lastScrollPercent){lastScrollPercent=percent;fill.style.width=percent+'%';}
  });
}
/* ------------------------------------------------------------ 设置窗口 */
const settings={tab:'workspace',draft:null};
function uiState(){
  return {
    uiFont:readPreference('uiFont',TYPOGRAPHY.uiFont.default),
    uiFontSize:Number(readPreference('uiFontSize',TYPOGRAPHY.uiFontSize.default))||TYPOGRAPHY.uiFontSize.default,
    uiLineHeight:Number(readPreference('uiLineHeight',TYPOGRAPHY.uiLineHeight.default))||TYPOGRAPHY.uiLineHeight.default,
    readerFont:readPreference('readerFont',TYPOGRAPHY.readerFont.default),
    fontSize:Number(readPreference('fontSize',TYPOGRAPHY.fontSize.default))||TYPOGRAPHY.fontSize.default,
    lineHeight:Number(readPreference('lineHeight',TYPOGRAPHY.lineHeight.default))||TYPOGRAPHY.lineHeight.default,
    appearance:document.documentElement.dataset.appearance||'light',
    readerIndent:readPreference('readerIndent',TYPOGRAPHY.readerIndent.default)!==false,
  };
}
function renderSettings(){
  const dialog=q('#settings-dialog');
  if(!dialog)return;
  const workspace=settings.tab==='workspace';
  dialog.innerHTML=settingsHead()+`<div class="set-frame">${settingsRail(settings.tab)}<div class="set-panel">${workspace?workspacePanel(settings.draft):typographyPanel(uiState())}</div></div>${workspace?workspaceFooter():''}`;
}
function openSettings(tab='workspace'){
  settings.tab=tab;
  settings.draft=clientPreferences(snapshot.preferences?.preferences??null);
  renderSettings();
  q('#settings-dialog').showModal();
}
function prefsStatus(text){
  const el=q('#settings-dialog [data-prefs-status]');
  if(el)el.textContent=text;
}
async function savePrefs(){
  if(!settings.draft)return;
  prefsStatus('正在保存…');
  try{
    /* 响应与 GET /api/projects 的 preferences 同形（{version,updatedAt,preferences} 包装） */
    const result=await api('/api/preferences',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':snapshot.sessionToken},body:JSON.stringify(editablePayload(settings.draft))});
    snapshot.preferences=result;
    prefsStatus('已保存');
  }catch(error){prefsStatus(error.message);}
}
function togglePrefChip(button){
  if(!settings.draft)return;
  const key=button.dataset.prefKey,value=button.dataset.prefValue,list=settings.draft[key];
  if(!Array.isArray(list))return;
  const at=list.indexOf(value);
  if(at>=0){
    list.splice(at,1);
    if(button.classList.contains('custom'))button.remove();
    else button.setAttribute('aria-pressed','false');
  } else {
    list.push(value);
    button.setAttribute('aria-pressed','true');
  }
  prefsStatus('有未保存的改动');
}
function beginPrefAdd(addButton){
  const key=addButton.dataset.prefAdd;
  const input=document.createElement('input');
  input.className='chip-input';
  input.dataset.prefInput=key;
  input.placeholder='回车添加，Esc 取消';
  input.setAttribute('aria-label','添加自定义项');
  addButton.replaceWith(input);
  input.focus();
}
const fromHtml=html=>{
  const template=document.createElement('template');
  template.innerHTML=html.trim();
  return template.content.firstElementChild;
};
function commitPrefAdd(input,commit){
  if(!input.isConnected||input.dataset.committed==='1')return;
  input.dataset.committed='1';/* Enter 与 focusout 双触发只结算一次 */
  const key=input.dataset.prefInput;
  const value=(input.value||'').trim();
  const restore=()=>input.replaceWith(fromHtml(addButtonHtml(key)));
  if(!commit||!value||!settings.draft||!Array.isArray(settings.draft[key])){restore();return;}
  if(!settings.draft[key].includes(value)){
    settings.draft[key].push(value);
    input.before(fromHtml(chipHtml(key,value,{custom:true,pressed:true})));
    prefsStatus('有未保存的改动');
  }
  restore();
}
function stepValue(key,delta){
  const rule=TYPOGRAPHY[key];
  const current=Number(readPreference(key,rule.default))||rule.default;
  const step=rule.step||1;
  let next=Math.min(rule.max,Math.max(rule.min,Math.round((current+delta*step)*10)/10));
  writePreference(key,next);
  return next;
}
q('#nav-toggle').addEventListener('click',()=>{q('#sidebar').classList.contains('open')?closeDrawer():openDrawer();});
q('#sidebar-toggle').addEventListener('click',()=>{writePreference('sidebarCollapsed',!document.documentElement.classList.contains('sidebar-collapsed'));applySidebarCollapsed();});
let resizeTimer;
addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(applySidebarCollapsed,150);});
q('#sidebar-backdrop').addEventListener('click',closeDrawer);
document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.tagName==='A')landedViaClick=true;
  if(target.dataset.shelfPage){shelfPage=Number(target.dataset.shelfPage);q('#content').innerHTML=shelf(snapshot.projects,snapshot.warnings,shelfPage,lastReading());q('.library')?.scrollIntoView({block:'start'});return;}
  if(target.dataset.progressPage!==undefined){const r=route(),project=snapshot.projects.find(p=>p.id===r?.id);if(project){progressPages.set(r.id,Number(target.dataset.progressPage));q('#content').innerHTML=progressPage(project);}return;}
  if(target.dataset.statusFilter){const r=route(),project=snapshot.projects.find(p=>p.id===r?.id);if(project){progressFilters.set(project.id,target.dataset.statusFilter);progressPages.delete(project.id);q('#content').innerHTML=progressPage(project);}return;}
  if(target.id==='workspace-label'||target.dataset.openWorkspace!==undefined){q('#workspace-path').value=snapshot.workspace||'';q('#workspace-error').textContent='';q('#workspace-dialog').showModal();return;}
  if(target.id==='workspace-browse'){
    /* 弹系统目录选择框：由本地服务端代弹（浏览器不向网页暴露绝对路径），选中即回填输入框，取消不动 */
    const button=target;button.disabled=true;button.textContent='选择中…';
    (async()=>{
      try{
        const data=await api('/api/pick-folder',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':snapshot.sessionToken},body:JSON.stringify({from:snapshot.workspace})});
        if(data.path){q('#workspace-path').value=data.path;q('#workspace-error').textContent='';q('#workspace-path').focus();}
      }catch(error){q('#workspace-error').textContent=error.message||'无法弹出系统选择框，请手动填写路径';}
      finally{button.disabled=false;button.textContent='浏览…';}
    })();
    return;
  }
  if(target.id==='appearance-toggle'){toggleAppearance();return;}
  /* —— 设置窗口 —— */
  if(target.id==='open-settings'){openSettings();return;}
  if(target.dataset.settingsTab){settings.tab=target.dataset.settingsTab;renderSettings();return;}
  if(target.dataset.prefKey){togglePrefChip(target);return;}
  if(target.dataset.prefAdd!==undefined){beginPrefAdd(target);return;}
  const countWrap=target.closest('[data-count-key]');
  if(countWrap&&target.dataset.countStep){
    if(settings.draft){
      const next=Math.min(500,Math.max(1,(settings.draft.typicalChapterCount??20)+Number(target.dataset.countStep)));
      settings.draft.typicalChapterCount=next;
      countWrap.querySelector('b').textContent=String(next);
      prefsStatus('有未保存的改动');
    }
    return;
  }
  const uiStepWrap=target.closest('[data-ui-step]');
  if(uiStepWrap&&target.dataset.countStep){
    const key=uiStepWrap.dataset.uiStep;
    const next=stepValue(key,Number(target.dataset.countStep));
    applyUiTypography();
    uiStepWrap.querySelector('b').textContent=key==='uiLineHeight'?next.toFixed(1):String(next);
    return;
  }
  if(target.dataset.uiFont){writePreference('uiFont',target.dataset.uiFont);applyUiFont();return;}
  if(target.dataset.appearanceChoice){writePreference('appearance',target.dataset.appearanceChoice);applyAppearance();return;}
  if(target.dataset.indentToggle!==undefined){
    const next=readPreference('readerIndent',true)===false;
    writePreference('readerIndent',next);applyReaderIndent();
    target.setAttribute('aria-pressed',String(next));
    return;
  }
  if(target.dataset.resetPrefs!==undefined){
    if(confirm('清空排版偏好与各书阅读位置？\n（保留最近打开的工作区与上次阅读的书）')){
      clearPreferences();
      applyTypography();applyReaderFont();applyUiFont();applyUiTypography();applyReaderIndent();applyAppearance();applySidebarCollapsed();
      renderSettings();
    }
    return;
  }
  if(target.dataset.prefsSave!==undefined){savePrefs();return;}
  if(target.dataset.prefsRevert!==undefined){settings.draft=clientPreferences(snapshot.preferences?.preferences??null);renderSettings();return;}
  if(target.dataset.closeDialog){document.getElementById(target.dataset.closeDialog)?.close();return;}
  if(target.dataset.recentWorkspace){q('#workspace-path').value=target.dataset.recentWorkspace;q('#workspace-form').requestSubmit();return;}
  if(target.dataset.readerFont){writePreference('readerFont',target.dataset.readerFont);applyReaderFont();return;}
  if(target.dataset.headingLink){event.preventDefault();landedViaClick=false;/* 原地滚动，未发生导航，不消费「点击进入即回顶」标记 */let id=target.getAttribute('href').slice(1);try{id=decodeURIComponent(id);}catch{}document.getElementById(id)?.scrollIntoView({block:'start'});return;}
  if(target.dataset.unavailableLink){event.preventDefault();return;}
  if(target.id==='settings-toggle'){const panel=q('#reading-settings');const show=panel.hidden;panel.hidden=!show;target.setAttribute('aria-expanded',String(show));return;}
  if(target.id==='retry-document'||target.id==='reload-document'){saveScroll();display({reload:true});}
  if(target.id==='retry-connection'){connect();refresh().catch(()=>{});}
});
document.addEventListener('click',event=>{
  const origin=event.target instanceof Element?event.target:null;
  if(origin?.closest('#reading-settings,#settings-toggle'))return;
  closeReadingSettings();
});
q('#workspace-form').addEventListener('submit',async event=>{
  event.preventDefault();if(switchingWorkspace)return;
  switchingWorkspace=true;catalogEpoch++;q('#workspace-form button[type="submit"]').disabled=true;q('#workspace-error').textContent='正在打开…';
  try{
    await api('/api/workspaces/open',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':snapshot.sessionToken},body:JSON.stringify({path:q('#workspace-path').value.trim()})});
    saveScroll();controller?.abort();requestNumber++;current=null;progressFilters.clear();lastChanges={projects:new Set(),docs:new Map()};history.replaceState(null,'','#/');
    snapshot=await api('/api/projects');configurePreferenceScope(snapshot.workspace);workspaceInfo();q('#workspace-dialog').close();await display();
  }catch(error){q('#workspace-error').textContent=error.message;}
  finally{switchingWorkspace=false;q('#workspace-form button[type="submit"]').disabled=false;refresh().catch(()=>{});}
});
document.addEventListener('input',event=>{
  const target=event.target;
  if(target.dataset.typeSlider){writePreference(target.dataset.typeSlider,Number(target.value));target.nextElementSibling.textContent=target.value;applyTypography();}
});
document.addEventListener('focusout',event=>{
  if(event.target instanceof Element&&event.target.dataset.prefInput!==undefined)commitPrefAdd(event.target,true);
});
document.addEventListener('keydown',event=>{
  const chipInput=event.target instanceof Element?event.target.closest('[data-pref-input]'):null;
  if(chipInput){
    if(event.key==='Enter'){event.preventDefault();commitPrefAdd(chipInput,true);}
    else if(event.key==='Escape'){event.preventDefault();commitPrefAdd(chipInput,false);}
    return;
  }
  if(event.key==='Escape'){closeDrawer(true);closeReadingSettings(true);return;}
  if(document.querySelector('dialog[open]'))return;
  if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
  const tag=event.target.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||event.target.isContentEditable)return;
  const r=route();
  if(!r)return;
  const project=snapshot.projects.find(p=>p.id===r.id);
  if(!project)return;
  if(r.view==='read'&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){
    const available=project.chapters.filter(c=>c.exists);
    const index=available.findIndex(c=>c.id===current?.chapterId);
    if(index<0)return;
    const target=event.key==='ArrowLeft'?available[index-1]:available[index+1];
    if(target){event.preventDefault();landedViaClick=true;location.hash=href(r.id,'read',target.id);}
  } else if(/^[1-5]$/.test(event.key)){
    const key=tabViews[Number(event.key)-1];
    if(key&&key!==r.view){event.preventDefault();location.hash=href(r.id,key);}
  }
});
let scrollTimer;
addEventListener('scroll',()=>{updateScrollLine();const tip=q('#report-tip');if(tip&&!tip.hidden)tip.hidden=true;clearTimeout(scrollTimer);scrollTimer=setTimeout(saveScroll,150);},{passive:true});
/* 审读图表悬停层：所有 [data-tip] 共用一个浮动提示；离开提示元素时才隐藏 */
document.addEventListener('mouseover',event=>{
  const tip=event.target instanceof Element?event.target.closest('[data-tip]'):null;
  const panel=q('#report-tip');
  if(!panel||!tip)return;
  panel.textContent=tip.dataset.tip;
  panel.hidden=false;
  const box=tip.getBoundingClientRect(),self=panel.getBoundingClientRect();
  const left=Math.min(innerWidth-self.width-8,Math.max(8,box.left+box.width/2-self.width/2));
  let top=box.top-self.height-8;
  if(top<8)top=Math.min(innerHeight-self.height-8,box.bottom+8);
  panel.style.left=left+'px';panel.style.top=top+'px';
});
document.addEventListener('mouseout',event=>{
  const from=event.target instanceof Element?event.target.closest('[data-tip]'):null;
  const to=event.relatedTarget instanceof Element?event.relatedTarget?.closest('[data-tip]'):null;
  if(from&&(!to||from!==to))q('#report-tip')?.setAttribute('hidden','');
});
addEventListener('hashchange',()=>{clearTimeout(scrollTimer);if(current?.key)writePreference('position:'+current.key,scrollY);closeDrawer();display();});
addEventListener('pagehide',()=>{saveScroll();events?.close();});
history.scrollRestoration='manual';
applyTypography();applyReaderFont();applyUiFont();applyUiTypography();applyReaderIndent();applyAppearance();applySidebarCollapsed();
try {snapshot=await api('/api/projects');configurePreferenceScope(snapshot.workspace);workspaceInfo();q('#restart-command').textContent=snapshot.restartCommand||'请重新运行启动书房时的 node 命令。';await display();connect();}
catch(error){q('#content').innerHTML=empty('无法读取工作区',error.message);q('#connection-help').hidden=false;connect();}
