import { renderMarkdown } from './markdown.js';
import { extractReadingContent, extractSection } from './documents.js';
import { shelf, navigation, bookMenu, empty, progress, href, viewNames, summaryCoverage } from './views.js';
import { controls, enhanceDocument, applyTypography, readPreference, writePreference, configurePreferenceScope } from './reader.js';

const q=selector=>document.querySelector(selector);
let snapshot={projects:[],warnings:[],version:''},current=null,requestNumber=0,controller=null,events=null,rawMode=false,refreshPromise=null;
let restoreScroll=true;
const progressFilters=new Map();
function progressPage(project){return progress(project,progressFilters.get(project.id)||'all');}
function applyAppearance(){
  const theme=readPreference('theme','paper'),appearance=readPreference('appearance','system');
  document.documentElement.dataset.theme=['paper','white'].includes(theme)?theme:'paper';
  document.documentElement.dataset.appearance=['light','dark','system'].includes(appearance)?appearance:'system';
  document.querySelectorAll('[data-theme]').forEach(el=>{if(el.tagName==='BUTTON')el.setAttribute('aria-pressed',String(el.dataset.theme===theme));});
  document.querySelectorAll('[data-appearance]').forEach(el=>{if(el.tagName==='BUTTON')el.setAttribute('aria-pressed',String(el.dataset.appearance===appearance));});
}
function workspaceInfo(){
  q('#workspace-label').textContent=snapshot.workspace?'工作区：'+snapshot.workspace:'';
  const stored=readPreference('recentWorkspaces',[]),prior=Array.isArray(stored)?stored.filter(p=>typeof p==='string'):[];
  const recent=[...new Set([snapshot.workspace,...prior].filter(Boolean))].slice(0,8);writePreference('recentWorkspaces',recent);
  q('#recent-workspaces').replaceChildren();
  for(const path of recent){const button=document.createElement('button');button.dataset.recentWorkspace=path;button.textContent=path;q('#recent-workspaces').append(button);}
}
function route() {
  try {
    const match=location.hash.match(/^#\/projects\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if(!match)return null;
    const id=decodeURIComponent(match[1]),view=decodeURIComponent(match[2]),chapterId=match[3]?decodeURIComponent(match[3]):undefined;
    return {id,view:Object.hasOwn(viewNames,view)?view:'outline',chapterId};
  }catch{return null;}
}
async function api(url,signal) {
  const response=await fetch(url,{signal});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'读取失败，请重试。');
  return data;
}
function shell(project,r) {
  q('#book-switch').hidden=!project;q('#work-separator').hidden=!project;q('#shelf-link').hidden=!project;q('#navigation').hidden=!project;
  q('#book-switch').textContent=project?.title||'';
  q('#book-menu').innerHTML=bookMenu(snapshot.projects,r?.view);
  q('#navigation').innerHTML=project?navigation(project,r.view):'';
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
  controller?.abort();controller=new AbortController();
  const signal=controller.signal,r=route();
  const project=r?snapshot.projects.find(p=>p.id===r.id):null;
  const oldKey=current?.key;
  setReload(false);q('#book-menu').hidden=true;q('#book-switch').setAttribute('aria-expanded','false');
  shell(project,r);q('#content').classList.remove('reading');
  if(!r){current=null;q('#content').innerHTML=shelf(snapshot.projects,snapshot.warnings);q('#source-label').textContent='内容来自工作区文件';if(restoreScroll)restorePosition(location.hash);return;}
  if(!project){current=null;q('#content').innerHTML=empty('作品不存在或已被移除','请返回书架，查看当前工作区内的作品。');return;}
  if(r.view==='progress'){current={key:location.hash,projectId:r.id};q('#content').innerHTML=progressPage(project);q('#source-label').textContent='文件实测 / 写作计划记录';return;}
  let chapter=null,docId=r.view;
  if(r.view==='read') {
    const preferred=r.chapterId||readPreference('chapter:'+r.id,null);
    chapter=project.chapters.find(c=>c.id===preferred);
    if(r.chapterId&&!chapter){current={key:location.hash,projectId:r.id};q('#content').innerHTML=empty('章节不存在或已移除','当前链接对应的章节已不在作品目录中。请选择正文导航，重新选择章节。');return;}
    if(!chapter)chapter=project.chapters.find(c=>c.exists);
    if(!chapter){current={key:location.hash,projectId:r.id};q('#content').innerHTML=empty('正文尚未生成','章节文件生成后将出现在目录中。你可以先查看大纲、人物与文风资料。');return;}
    if(!r.chapterId)history.replaceState(null,'',href(r.id,'read',chapter.id));
    writePreference('chapter:'+r.id,chapter.id);docId=chapter.id;
  }
  if(r.view==='facts')docId='outline';
  if(r.view==='summaries')docId='summary-view';
  const info=docId==='summary-view'?{exists:true,version:project.summaryVersion,fileName:'章节摘要汇总视图'}:chapter||project.documents.find(d=>d.id===docId);
  if(!info?.exists&&!(current?.projectId===r.id&&current?.docId===docId&&current?.version)){current={key:location.hash,projectId:r.id,docId};q('#content').innerHTML=empty('资料尚未生成',`此作品还没有可读取的${viewNames[r.view]}资料。文件生成后会自动发现。`);return;}
  const key=location.hash;
  if(oldKey!==key)rawMode=false;
  try {
    const data=await api(`/api/projects/${r.id}/documents/${docId}`,signal);
    if(ticket!==requestNumber)return;
    current={key,projectId:r.id,docId,version:data.version,chapterId:chapter?.id};
    let markdown=data.text,notice='';
    if(r.view==='read'&&!rawMode){const extracted=extractReadingContent(markdown);markdown=extracted.markdown;notice=extracted.notice;}
    if(r.view==='facts'){const section=extractSection(markdown,['设定与事实词典','设定词典']);markdown=section.markdown;if(!section.found)notice='未找到独立词典区，显示完整大纲。';else notice='设定词典包含完整真相，可能涉及剧透。';}
    if(r.view==='summaries'&&!project.summaryCoverage?.available)notice='暂无有效章节摘要，当前文件可能只有模板说明。摘要需要由写作 Agent 收尾保存。';
    function routeForDocument(target) {
      let file=target;try{file=decodeURIComponent(target.split('#')[0]);}catch{return null;}
      file=file.replace(/^\.\//,'');
      const doc=project.documents.find(d=>d.fileName===file&&d.exists);
      if(doc&&viewNames[doc.id])return href(r.id,doc.id);
      const linked=project.chapters.find(c=>c.fileName===file&&c.exists);
      return linked?href(r.id,'read',linked.id):null;
    }
    const rendered=renderMarkdown(markdown,{projectId:r.id,assets:data.assets,routeForDocument});
    const frame=controls(project,chapter,rawMode,r.view==='read');
    q('#content').classList.toggle('reading',r.view==='read'&&!rawMode);
    q('#content').innerHTML=frame.top+(r.view==='summaries'?summaryCoverage(project):'')+'<p id="document-notice" class="muted document-top"></p><article class="markdown"></article>'+frame.bottom;
    q('#document-notice').textContent=[notice,...data.warnings].filter(Boolean).join(' ');
    if(!q('#document-notice').textContent)q('#document-notice').hidden=true;
    q('.markdown').innerHTML=rendered;enhanceDocument(q('.markdown'));applyTypography();
    q('#source-label').textContent=info.fileName||info.name;
    if(reload)scrollTo(0,Number(readPreference('position:'+key,0))||0);
    else restorePosition(key,restoreScroll);
  } catch(error) {
    if(error.name==='AbortError'||ticket!==requestNumber)return;
    q('#content').innerHTML=empty('资料暂不可读',error.message)+'<button id="retry-document" class="text-link">重新读取</button>';
  }
}
function updateNavigation(project) {
  const picker=q('#chapter-picker .chapter-list');
  if(picker){const template=document.createElement('template');template.innerHTML=controls(project,null).top;picker.innerHTML=template.content.querySelector('.chapter-list')?.innerHTML||'';}
  const paging=q('.chapter-paging');
  if(paging&&current?.chapterId){const chapter=project.chapters.find(c=>c.id===current.chapterId);if(chapter)paging.outerHTML=controls(project,chapter).bottom;}
}
async function refresh() {
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{
    const updated=await api('/api/projects'),rootChanged=snapshot.workspace&&updated.workspace!==snapshot.workspace;
    if(rootChanged){saveScroll();controller?.abort();current=null;history.replaceState(null,'','#/');configurePreferenceScope(updated.workspace);progressFilters.clear();}
    snapshot=updated;workspaceInfo();
    if(snapshot.restartCommand)q('#restart-command').textContent=snapshot.restartCommand;
    const r=route();
    if(!r){const y=scrollY;q('#content').innerHTML=shelf(snapshot.projects,snapshot.warnings);scrollTo(0,y);shell(null,null);return;}
    const project=snapshot.projects.find(p=>p.id===r.id);
    if(!project){await display();return;}
    shell(project,r);
    if(r.view==='progress'){q('#content').innerHTML=progressPage(project);return;}
    updateNavigation(project);
    if(!current?.version){await display();return;}
    const doc=current.docId==='summary-view'?{version:project.summaryVersion}:project.documents.find(d=>d.id===current.docId)||project.chapters.find(c=>c.id===current.docId);
    if(!doc||doc.version!==current.version)setReload(true);
  })().finally(()=>refreshPromise=null);
  return refreshPromise;
}
function connect() {
  events?.close();events=new EventSource('/api/events');
  events.onopen=()=>{q('#connection').textContent='已连接 · 本地只读';q('#connection-help').hidden=true;};
  events.onerror=()=>{q('#connection').textContent='连接已断开 · 正在重连';q('#connection-help').hidden=false;};
  events.addEventListener('catalog',event=>{try{const value=JSON.parse(event.data);if(value.version!==snapshot.version)refresh().catch(()=>{});}catch{/* Invalid notifications never replace readable content. */}});
}
q('#book-switch').addEventListener('click',()=>{const open=q('#book-menu').hidden;q('#book-menu').hidden=!open;q('#book-switch').setAttribute('aria-expanded',String(open));});
document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.dataset.statusFilter){const r=route(),project=snapshot.projects.find(p=>p.id===r?.id);if(project){progressFilters.set(project.id,target.dataset.statusFilter);q('#content').innerHTML=progressPage(project);}return;}
  if(target.id==='open-workspace'){q('#workspace-path').value=snapshot.workspace||'';q('#workspace-error').textContent='';q('#workspace-dialog').showModal();return;}
  if(target.id==='open-appearance'){applyAppearance();q('#appearance-dialog').showModal();return;}
  if(target.dataset.closeDialog){document.getElementById(target.dataset.closeDialog)?.close();return;}
  if(target.dataset.recentWorkspace){q('#workspace-path').value=target.dataset.recentWorkspace;q('#workspace-form').requestSubmit();return;}
  if(target.dataset.theme){writePreference('theme',target.dataset.theme);applyAppearance();return;}
  if(target.dataset.appearance){writePreference('appearance',target.dataset.appearance);applyAppearance();return;}
  if(target.dataset.headingLink){event.preventDefault();let id=target.getAttribute('href').slice(1);try{id=decodeURIComponent(id);}catch{}document.getElementById(id)?.scrollIntoView({block:'start'});return;}
  if(target.dataset.unavailableLink){event.preventDefault();return;}
  if(target.id==='settings-toggle'){q('#reading-settings').hidden=!q('#reading-settings').hidden;target.setAttribute('aria-expanded',String(!q('#reading-settings').hidden));}
  if(target.id==='source-toggle'){saveScroll();rawMode=!rawMode;restoreScroll=false;display().finally(()=>restoreScroll=true);}
  if(target.id==='retry-document'||target.id==='reload-document'){saveScroll();display({reload:true});}
  if(target.id==='retry-connection'){connect();refresh().catch(()=>{});}
});
q('#workspace-form').addEventListener('submit',async event=>{
  event.preventDefault();q('#workspace-error').textContent='正在打开…';
  try{
    const response=await fetch('/api/workspaces/open',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':snapshot.sessionToken},body:JSON.stringify({path:q('#workspace-path').value.trim()})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'无法打开目录');
    saveScroll();controller?.abort();requestNumber++;current=null;progressFilters.clear();history.replaceState(null,'','#/');
    snapshot=await api('/api/projects');configurePreferenceScope(snapshot.workspace);workspaceInfo();q('#workspace-dialog').close();await display();
  }catch(error){q('#workspace-error').textContent=error.message;}
});
document.addEventListener('input',event=>{
  const target=event.target;
  if(target.id==='font-size'||target.id==='line-height'){writePreference(target.id==='font-size'?'fontSize':'lineHeight',Number(target.value));target.nextElementSibling.textContent=target.value;applyTypography();}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){q('#book-menu').hidden=true;q('#book-switch').setAttribute('aria-expanded','false');}});
let scrollTimer;addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(saveScroll,150);},{passive:true});
addEventListener('hashchange',()=>{clearTimeout(scrollTimer);if(current?.key)writePreference('position:'+current.key,scrollY);display();});
addEventListener('pagehide',()=>{saveScroll();events?.close();});
history.scrollRestoration='manual';applyTypography();applyAppearance();
try {snapshot=await api('/api/projects');configurePreferenceScope(snapshot.workspace);workspaceInfo();q('#restart-command').textContent=snapshot.restartCommand||'请重新运行启动工作台时的 node 命令。';await display();connect();}
catch(error){q('#content').innerHTML=empty('无法读取工作区',error.message);q('#connection-help').hidden=false;connect();}
