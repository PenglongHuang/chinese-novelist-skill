import { escapeHtml as e } from './markdown.js';

export const viewNames={progress:'章节进度',read:'小说正文',docs:'创作资料'};
export const tabViews=Object.keys(viewNames);
export const docSubTabs=[['people','人物档案'],['style','文风基准'],['outline','大纲'],['summaries','摘要']];
export const docSubs=docSubTabs.map(([key])=>key).concat('facts');
export const href=(id,view='progress',doc='')=>`#/projects/${encodeURIComponent(id)}/${view}${doc?'/'+encodeURIComponent(doc):''}`;
export const number=n=>n===null||n===undefined||!Number.isFinite(Number(n))?'—':Number(n).toLocaleString('zh-CN');
const chapterStats=p=>({done:p.chapters.filter(c=>c.exists).length,total:p.totalChapters??p.chapters.length});
const fmtDate=iso=>{try{return new Date(iso).toLocaleDateString('zh-CN');}catch{return '';}};
export const statusNames={pending:'规划中',in_progress:'写作中',validating:'校验中',completed:'已完成',failed:'需修复',needs_sync:'状态待同步'};
const shelfStages={planning:'规划中',in_progress:'写作中',validating:'校验中',needs_attention:'需修复',completed:'已完成'};
const stateOf=c=>c.effectiveStatus||'pending';
export const needsRepair=c=>stateOf(c)==='failed'||stateOf(c)==='needs_sync'||(c.recordedStatus==='completed'&&(c.summarySource==='missing'||c.actualWordCountPass===false));

/* 墨条：一格一章，颜色即状态。interactive=进度页可点；mini=侧栏概览；rail=阅读器定位轨。超过 60 章按 10 章合并成格。 */
const groupRank={failed:0,needs_sync:1,in_progress:2,validating:3,pending:4,completed:5};
export function inkbar(project,{interactive=false,rail=false,currentId=null,dim=null}={}){
  const chapters=project.chapters;
  const emitCell=({state,label,jump,dimmed,current})=>{
    const tip=interactive?` title="${e(label)}" aria-label="${e(label)}"`:'';
    const attrs=`data-state="${e(state)}"${dimmed?' data-dim':''}${current?' data-current':''}${tip}`;
    if(interactive&&jump)return `<a class="cell${jump.grouped?' grouped':''}" ${attrs} href="${href(project.id,'read',jump.id)}"${rail?' tabindex="-1"':''}></a>`;
    return `<span class="cell${jump&&jump.grouped?' grouped':''}" ${attrs}></span>`;
  };
  let cells='';
  if(chapters.length>60){
    const currentIndex=currentId?chapters.findIndex(c=>c.id===currentId):-1;
    const step=Math.max(10,Math.ceil(chapters.length/40));
    for(let i=0;i<chapters.length;i+=step){
      const group=chapters.slice(i,i+step),counts={};
      let worst='completed';
      for(const c of group){const st=stateOf(c);counts[st]=(counts[st]||0)+1;if((groupRank[st]??9)<(groupRank[worst]??9))worst=st;}
      const first=group[0],last=group[group.length-1];
      const jump=interactive?group.find(c=>c.exists):null;
      if(jump)jump.grouped=true;
      cells+=emitCell({
        state:worst,
        label:`第${first.number??'?'}–${last.number??'?'}章 ${Object.entries(counts).map(([k,n])=>`${statusNames[k]||k} ${n}`).join(' · ')}`,
        jump,dimmed:dim?dim(group):false,
        current:currentIndex>=i&&currentIndex<i+group.length,
      });
    }
  } else {
    for(const c of chapters){
      const st=stateOf(c);
      cells+=emitCell({
        state:st,
        label:`第${c.number??'?'}章 ${c.title} · ${statusNames[st]||st}${c.actualWordCount!==null&&c.actualWordCount!==undefined?` · ${number(c.actualWordCount)} 字`:''}`,
        jump:interactive&&c.exists?c:null,
        dimmed:dim?dim([c]):false,
        current:c.id===currentId,
      });
    }
  }
  const kind=(interactive||rail?' interactive':'')+(rail?' rail':'')+(interactive||rail?'':' mini');
  return `<div class="inkbar${kind}" role="${interactive?'group':'presentation'}" aria-label="${interactive?'章节状态条':'章节状态概览'}"${interactive?'':' aria-hidden="true"'}>${cells}</div>`;
}

export function navigation(project,view){return tabViews.map(key=>`<a class="view-tab" data-view="${key}" href="${href(project.id,key)}" ${key===view?'aria-current="page"':''}>${viewNames[key]}</a>`).join('');}

export function sidebarBooks(projects,currentId=null,view='progress'){
  return projects.map(p=>{
    const {done,total}=chapterStats(p);
    const mini=e(p.title.replace(/^「|」$/g,'').slice(0,2));
    return `<a class="side-book${p.id===currentId?' current':''}" href="${href(p.id,view)}"${p.id===currentId?' aria-current="page"':''} title="${e(p.title)} · ${done}/${total} 章"><span class="sb-full"><span class="side-book-top"><span class="side-book-title">「${e(p.title)}」</span><span class="side-book-count">${done}/${total}</span></span>${inkbar(p)}<span class="side-book-meta">${number(p.actualWords)} 字${p.updatedAt?` · 更新于 ${e(fmtDate(p.updatedAt))}`:''}</span></span><span class="sb-mini" aria-hidden="true">${mini}<i class="dot" data-state="${e(p.recordedStatus||'unknown')}"></i></span></a>`;
  }).join('');
}

export function bookHeader(project){
  const {done,total}=chapterStats(project);
  return `<div class="book-title-row"><h1>「${e(project.title)}」</h1><span class="title-meta">${done} / ${total} 章 · ${number(project.actualWords)} 字</span></div>`;
}

export function empty(title,message,actions=''){return `<section class="empty"><h1>${e(title)}</h1><p>${e(message)}</p>${actions}<a class="text-link" href="#/">返回全部作品</a></section>`;}

export function summaryCoverage(project){
  const c=project.summaryCoverage;
  if(!c||(!c.missing.length&&!c.conflicts.length))return '';
  return `<section class="coverage">${c.missing.length?`<p class="warning">缺失摘要：第 ${c.missing.join('、')} 章</p>`:''}${c.conflicts.length?`<p class="warning">摘要冲突：第 ${c.conflicts.join('、')} 章，请核对来源。</p>`:''}</section>`;
}

const repairFilters={needs_sync:'状态待同步',summary_missing:'缺少摘要',word_fail:'字数不足'};
const matches=(c,key)=>key==='all'||(key==='repair'?needsRepair(c):key==='needs_sync'?stateOf(c)==='needs_sync':key==='summary_missing'?c.recordedStatus==='completed'&&c.summarySource==='missing':key==='word_fail'?c.actualWordCountPass===false:stateOf(c)===key);

export function progress(project,filter='all',changedDocs=null,page=1,pageSize=10){
  const filters={all:'全部',pending:'规划中',in_progress:'写作中',validating:'校验中',repair:'需修复',completed:'已完成'};
  const selected=project.chapters.filter(c=>matches(c,filter));
  const repairSelected=filter==='repair'||Object.hasOwn(repairFilters,filter);
  const pages=Math.max(1,Math.ceil(selected.length/pageSize));
  page=Math.max(1,Math.min(pages,Number.isFinite(page)?Math.floor(page):1));
  const visible=selected.slice((page-1)*pageSize,page*pageSize);
  const legend=Object.entries(filters).map(([key,label],i)=>`${i>1?'<i class="filter-arrow" aria-hidden="true">→</i>':''}<button class="filter-chip"${key!=='all'?` data-state="${key==='repair'?'failed':key}"`:''} data-status-filter="${key}" aria-pressed="${key===filter}">${label} <span class="count">${project.chapters.filter(c=>matches(c,key)).length}</span></button>`).join('');
  const repairRow=repairSelected?`<div class="filter-row sub" role="group" aria-label="修复类型">${Object.entries(repairFilters).map(([key,label])=>`<button class="filter-chip" data-status-filter="${key}" data-state="${key==='needs_sync'?'needs_sync':'failed'}" aria-pressed="${key===filter}">${label} <span class="count">${project.chapters.filter(c=>matches(c,key)).length}</span></button>`).join('')}</div>`:'';
  const pager=pages>1?`<nav class="chapter-pager" aria-label="章节分页"><button data-progress-page="${page-1}" ${page===1?'disabled':''}>上一页</button><span>第 ${page} / ${pages} 页</span><button data-progress-page="${page+1}" ${page===pages?'disabled':''}>下一页</button></nav>`:'';
  const rows=visible.map(c=>{
    const st=stateOf(c),repair=needsRepair(c);
    const title=c.exists?`<a class="ch-title" href="${href(project.id,'read',c.id)}"><span class="ch-number">第${c.number??'?'}章</span>${e(c.title)}</a>`:`<span class="ch-title none"><span class="ch-number">第${c.number??'?'}章</span>${e(c.title)}</span>`;
    return `<div class="chapter-row${repair?' repair':''}${changedDocs?.has(c.id)?' pulse':''}" data-state="${e(st)}">${title}<span class="ch-status" data-state="${e(st)}"><i class="dot" data-state="${e(st)}" aria-hidden="true"></i>${e(statusNames[st]||st)}</span><span class="ch-words">${c.actualWordCount===null||c.actualWordCount===undefined?'—':number(c.actualWordCount)+' 字'}</span>${c.syncIssues?.length?`<p class="ch-warn">${e(c.syncIssues.join('；'))}</p>`:''}</div>`;
  }).join('');
  const meta=filter!=='all'&&!Object.hasOwn(repairFilters,filter)?`<p class="row-meta">已筛选 ${selected.length} / ${project.chapters.length} 章</p>`:'';
  return `<section class="progress-view" aria-label="章节进度"><div class="filter-row" role="group" aria-label="按状态筛选章节">${legend}</div>${repairRow}${meta}<div class="chapter-list">${rows||'<p class="empty">没有符合条件的章节。</p>'}</div>${pager}</section>`;
}

export function shelf(projects,warnings=[],page=1,reading=null,changedProjects=null){
  const pageSize=8;
  /* 继续阅读卡已展示的作品不重复占列表位 */
  const rest=reading?projects.filter(p=>p.id!==reading.project.id):projects;
  const pages=Math.max(1,Math.ceil(rest.length/pageSize));
  page=Math.max(1,Math.min(pages,Number.isFinite(page)?Math.floor(page):1));
  const visible=rest.slice((page-1)*pageSize,(page-1)*pageSize+pageSize);
  const chapters=projects.reduce((n,p)=>n+p.chapters.filter(c=>c.exists).length,0);
  const words=projects.reduce((n,p)=>n+(p.actualWords||0),0);
  const resume=reading?`<section class="resume-card"><div class="resume-main"><p class="resume-kicker">${reading.remembered?'继续阅读':'最近更新'}</p><h2>${e(reading.project.title)}</h2><p class="resume-chapter">读到 第${reading.chapter.number??'?'}章 ${e(reading.chapter.title)}${reading.remembered?'':'（最新已有章节）'}</p></div><div class="resume-actions"><a class="solid-btn" href="${reading.href}">${reading.remembered?'继续阅读':'打开小说正文'}</a><a class="ghost-btn" href="${href(reading.project.id,'progress')}">查看进度</a></div></section>`:'';
  const row=p=>{
    const {done,total}=chapterStats(p);
    const repair=p.warnings.length>0||p.chapters.some(needsRepair);
    return `<a class="book-row${repair?' need-repair':''}${changedProjects?.has(p.id)?' pulse':''}" href="${href(p.id)}"${p.warnings.length?` title="${e(p.warnings.join(' '))}"`:''}><span class="row-title"><strong>${e(p.title)}</strong><span class="row-genre">${e(p.genre||'未标注题材')}</span></span>${inkbar(p)}<span class="row-chapters">${done} / ${total} 章</span><span class="row-words">${number(p.actualWords)} 字</span><span class="row-status" data-state="${e(p.recordedStatus||'unknown')}">${e(shelfStages[p.recordedStatus]||'状态未记录')}</span><span class="row-date">${p.updatedAt?'更新于 '+e(fmtDate(p.updatedAt)):'等待更新'}</span></a>`;
  };
  return `<div class="library"><section class="library-head"><h1>全部作品</h1><p class="library-stats"><strong>${projects.length}</strong> 部作品<strong>${chapters}</strong> 章正文<strong>${number(words)}</strong> 字</p></section>${warnings.map(w=>`<p class="warning">${e(w)}</p>`).join('')}${projects.length?`${resume}<section class="shelf-rows" aria-label="作品列表">${visible.map(row).join('')}</section>${pages>1?`<nav class="shelf-pagination" aria-label="书架分页"><button data-shelf-page="${page-1}" ${page===1?'disabled':''}>上一页</button><span>第 ${page} / ${pages} 页</span><button data-shelf-page="${page+1}" ${page===pages?'disabled':''}>下一页</button></nav>`:''}`:`<div class="empty blank-shelf"><h2>这里还没有小说作品</h2><p>使用「打开工作区」选择已有小说的集合目录；新作品生成后会自动出现。</p><button data-open-workspace class="solid-btn">打开工作区</button></div>`}</div>`;
}

export function tocChapters(project,currentId=null,showWords=true){
  return project.chapters.map(c=>{
    const name=`第${c.number??'?'}章 ${e(c.title)}${c.unplanned?'<em class="toc-note">未列入计划</em>':''}`;
    const words=c.exists&&c.actualWordCount!==null&&c.actualWordCount!==undefined?number(c.actualWordCount):'';
    const tail=showWords?`<span class="toc-words">${words}</span>`:'';
    if(c.exists)return `<a class="toc-row" href="${href(project.id,'read',c.id)}"${c.id===currentId?' aria-current="true"':''}><span class="toc-name">${name}</span>${tail}</a>`;
    return `<span class="toc-row none"><span class="toc-name">${name}</span>${tail}</span>`;
  }).join('');
}
