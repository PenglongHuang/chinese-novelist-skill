import { escapeHtml as e } from './markdown.js';

export const viewNames={outline:'大纲',people:'人物',facts:'设定词典',style:'文风',summaries:'摘要',progress:'章节进度',read:'正文'};
export const href=(id,view='outline',doc='')=>`#/projects/${encodeURIComponent(id)}/${view}${doc?'/'+encodeURIComponent(doc):''}`;
const number=n=>n===null||n===undefined?'未记录':n.toLocaleString('zh-CN');
export function shelf(projects,warnings=[]) {
  return `<div class="shelf-heading"><h1>工作区作品</h1><p class="muted">${projects.length} 部作品</p></div>${warnings.map(w=>`<p class="warning">${e(w)}</p>`).join('')}${projects.length?`<ul class="book-list">${projects.map(p=>`<li><a class="book-link" href="${href(p.id)}"><div><h2>${e(p.title)}</h2><p class="muted">${e(p.genre||'题材未记录')}</p><p class="muted">${e(p.directoryName)}</p>${p.warnings.length?`<p class="warning">${e(p.warnings.join(' '))}</p>`:''}</div><div class="book-stats"><p>${p.completedChapters===null?'进度未记录':`${p.completedChapters} / ${p.totalChapters??'?'} 章，计划标记已完成`}</p><p class="muted">计划记录字数 ${number(p.recordedWords)}</p>${p.updatedAt?`<p class="muted">文件更新 ${e(new Date(p.updatedAt).toLocaleString('zh-CN'))}</p>`:''}</div></a></li>`).join('')}</ul>`:'<div class="empty"><h2>这里还没有小说作品</h2><p>请在 Agent 中创建作品，或用 --workspace 指定已有小说的集合目录。创建后会自动出现在这里。</p></div>'}`;
}
export function navigation(project,view) {
  return Object.entries(viewNames).map(([key,label])=>`<a data-view="${key}" href="${href(project.id,key)}" ${key===view?'aria-current="page"':''}>${label}</a>`).join('');
}
export function bookMenu(projects,view='outline') {
  return projects.map(p=>`<a href="${href(p.id,view)}"><span>${e(p.title)}</span><small>${e(p.directoryName)}</small></a>`).join('')+'<a class="text-link" href="#/">浏览全部作品</a>';
}
export function empty(title,message) { return `<section class="empty"><h1>${e(title)}</h1><p>${e(message)}</p><a class="text-link" href="#/">返回全部作品</a></section>`; }
export function progress(project) {
  const statuses={pending:'待创作',in_progress:'计划标记写作中',completed:'计划标记已完成',failed:'计划标记失败'};
  return `<section class="progress-view"><h1>章节进度</h1><p class="muted">状态和字数来自写作计划，文件存在性来自当前目录；不代表作者审定。</p>${project.chapters.map(c=>`<div class="progress-row"><div>${c.exists?`<a class="text-link" href="${href(project.id,'read',c.id)}">第${c.number??'?'}章　${e(c.title)}</a>`:`<span>第${c.number??'?'}章　${e(c.title)}</span>`}<p class="muted">${c.unplanned?'未列入计划':e(statuses[c.recordedStatus]||c.recordedStatus||'状态未记录')} / ${c.exists?'正文文件存在':'正文未生成或文件缺失'}</p></div><div class="progress-meta">计划记录字数 ${number(c.wordCount)}<br>${c.wordCountPass===true?'计划记录字数通过':c.wordCountPass===false?'计划记录字数未通过':'字数校验未记录'}</div></div>`).join('')||'<p>暂无章节记录。</p>'}</section>`;
}
