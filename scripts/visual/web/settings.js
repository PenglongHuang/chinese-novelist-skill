/* 设置窗口（纯渲染）：左轨两组——工作区偏好（表单+履历表）/ 全局排版（即时生效）。
   本模块只产 HTML 字符串与归一化函数，交互委托由 app.js 统一处理，保证可在 node 中直接断言。 */
import { escapeHtml as e } from './markdown.js';
import { TYPOGRAPHY } from './reader.js';
import { number } from './views.js';

/* 选项池与 chinese-novelist 问答流程（phase1 三层）一致；均支持 Other 自定义 */
const PREF_FIELDS=[
  {key:'favoriteGenres',label:'偏好题材',options:['悬疑推理','都市犯罪','历史架空','科幻','奇幻','言情','武侠','现实主义','谍战']},
  {key:'preferredProtagonist',label:'主角类型',options:['男性主角（独角戏）','女性主角（独角戏）','双主角（对手戏 / 双线）','群像戏（多线叙事）']},
  {key:'preferredPerspective',label:'叙事视角',options:['第一人称','第三人称限制视角','第三人称全知视角','多视角切换']},
  {key:'preferredTone',label:'故事基调',options:['紧张刺激','温情治愈','轻松幽默','沉重深刻']},
];
const LIST_FIELDS=[{key:'styleReferences',label:'风格参考'},{key:'dislikes',label:'雷点'}];
const EDITABLE_KEYS=[...PREF_FIELDS.map(f=>f.key),...LIST_FIELDS.map(f=>f.key),'typicalChapterCount'];

/* 宽容归一化：服务端给什么形状都能变成 v2；异常时返回 null（未初始化） */
export function clientPreferences(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const list=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'):[];
  const prefs={
    favoriteGenres:list(raw.favoriteGenres),preferredProtagonist:list(raw.preferredProtagonist),
    preferredPerspective:list(raw.preferredPerspective),preferredTone:list(raw.preferredTone),
    styleReferences:list(raw.styleReferences),dislikes:list(raw.dislikes),
    typicalChapterCount:Number.isInteger(raw.typicalChapterCount)&&raw.typicalChapterCount>=1&&raw.typicalChapterCount<=500?raw.typicalChapterCount:null,
    creationHistory:Array.isArray(raw.creationHistory)?raw.creationHistory.filter(h=>h&&typeof h==='object'):[],
  };
  return prefs;
}

const settingsTabs=[['workspace','工作区偏好'],['typography','全局排版']];
export const settingsRail=active=>`<nav class="set-rail" aria-label="设置分组">${settingsTabs.map(([key,label])=>`<button type="button" class="set-tab" role="tab" data-settings-tab="${key}" aria-selected="${key===active}">${label}</button>`).join('')}</nav>`;

export const chipHtml=(key,value,{custom=false,pressed=false}={})=>`<button type="button" class="pref-chip${custom?' custom':''}" data-pref-key="${e(key)}" data-pref-value="${e(value)}" aria-pressed="${pressed}"${custom?' title="点击移除"':''}>${e(value)}${custom?'<span class="chip-x" aria-hidden="true">×</span>':''}</button>`;
export const addButtonHtml=key=>`<button type="button" class="pref-chip add" data-pref-add="${e(key)}">+ 添加</button>`;
function chipRow(key,values,pool){
  const custom=values.filter(v=>!pool.includes(v));
  const poolChips=pool.map(option=>chipHtml(key,option,{pressed:values.includes(option)})).join('');
  const customChips=custom.map(value=>chipHtml(key,value,{custom:true,pressed:true})).join('');
  return `<div class="set-chips">${poolChips}${customChips}${addButtonHtml(key)}</div>`;
}
const stepper=(value,label)=>`<span class="stepper"><button type="button" data-count-step="-1" aria-label="减少${e(label)}">−</button><b>${value===null?'—':e(String(value))}</b><button type="button" data-count-step="1" aria-label="增加${e(label)}">+</button></span>`;
const segmented=(attr,current,options)=>`<span class="segmented small" role="group">${options.map(([key,label])=>`<button type="button" ${attr}="${key}" aria-pressed="${key===current}">${label}</button>`).join('')}</span>`;
const rangeRow=(label,attr,min,max,step,value)=>`<label class="set-range">${e(label)}<input type="range" ${attr} min="${min}" max="${max}" step="${step}" value="${value}"><output>${value}</output></label>`;

export function workspacePanel(prefs){
  if(!prefs)return `<div class="set-empty"><p class="set-empty-title">未调用 chinese-novelist 初始化工作区偏好</p><p class="set-empty-sub">首次用 chinese-novelist 创作后，会自动在工作区生成 user-preferences.json 并出现在这里。</p></div>`;
  const rows=PREF_FIELDS.map(field=>`<div class="set-row"><span class="set-row-label">${e(field.label)}</span>${chipRow(field.key,prefs[field.key],field.options)}</div>`).join('');
  const listRows=LIST_FIELDS.map(field=>`<div class="set-row"><span class="set-row-label">${e(field.label)}</span>${chipRow(field.key,prefs[field.key],[])}</div>`).join('');
  const countRow=`<div class="set-row"><span class="set-row-label">常用章数</span><div class="set-chips"><span data-count-key="typicalChapterCount">${stepper(prefs.typicalChapterCount,'常用章数')}</span></div></div>`;
  const history=prefs.creationHistory.length?(()=>{
    const words=prefs.creationHistory.reduce((n,h)=>n+(Number(h.words)||0),0);
    const rowsTable=prefs.creationHistory.map(h=>`<tr><td><b>《${e(String(h.title||''))}》</b></td><td>${Number.isFinite(Number(h.chapters))?e(String(h.chapters))+' 章':'—'}</td><td>${Number.isFinite(Number(h.words))?number(h.words):'—'}</td><td>${e(String(h.genre||'—'))}</td><td>${e(String(h.finishedAt||'—'))}</td></tr>`).join('');
    return `<div class="set-row set-history"><span class="set-row-label">创作履历</span><div class="set-history-main"><p class="set-history-meta">已完成 ${prefs.creationHistory.length} 部 · 共 ${number(words)} 字。<span class="set-history-note">由 chinese-novelist 维护，此处只读。</span></p><div class="table-scroll"><table class="set-table"><thead><tr><th>书名</th><th>章节</th><th>字数</th><th>题材</th><th>完成</th></tr></thead><tbody>${rowsTable}</tbody></table></div></div></div>`;
  })():`<div class="set-row set-history"><span class="set-row-label">创作履历</span><div class="set-history-main"><p class="set-history-meta">还没有完成的作品，写完一部后会自动记入。</p></div></div>`;
  return `<div class="set-body"><div class="set-group">口味</div>${rows}${countRow}${listRows}<div class="set-divider"></div><div class="set-group">履历</div>${history}</div>`;
}
export const workspaceFooter=()=>`<div class="set-foot"><span class="set-foot-hint" data-prefs-status></span><span class="set-foot-actions"><button type="button" class="ghost-btn" data-prefs-revert>恢复默认</button><button type="button" class="solid-btn" data-prefs-save>保存改动</button></span></div>`;

export function typographyPanel(ui){
  const font=TYPOGRAPHY.fontSize,leading=TYPOGRAPHY.lineHeight;
  return `<div class="set-body"><div class="set-group">网页</div>
    <div class="set-row"><span class="set-row-label">界面字体</span><div class="set-chips">${segmented('data-ui-font',ui.uiFont,[['kai','楷体'],['song','宋体'],['hei','黑体'],['system','系统']])}</div></div>
    <div class="set-row"><span class="set-row-label">界面字号</span><div class="set-chips"><span data-ui-step="uiFontSize">${stepper(ui.uiFontSize,'界面字号')}</span></div></div>
    <div class="set-row"><span class="set-row-label">界面行距</span><div class="set-chips"><span data-ui-step="uiLineHeight">${stepper(ui.uiLineHeight,'界面行距')}</span></div></div>
    <div class="set-divider"></div><div class="set-group">小说正文</div>
    <div class="set-row"><span class="set-row-label">正文字体</span><div class="set-chips">${segmented('data-reader-font',ui.readerFont,[['kai','楷体'],['song','宋体'],['hei','黑体']])}</div></div>
    <div class="set-row"><span class="set-row-label">字号 · 行距</span><div class="set-chips set-sliders">${rangeRow('字号','data-type-slider="fontSize"',font.min,font.max,font.step||1,ui.fontSize)}${rangeRow('行距','data-type-slider="lineHeight"',leading.min,leading.max,leading.step,ui.lineHeight)}</div></div>
    <div class="set-divider"></div><div class="set-group">底色</div>
    <div class="set-row"><span class="set-row-label">护眼底色</span><div class="set-chips">${segmented('data-appearance-choice',ui.appearance,[['light','浅色'],['dark','深色'],['paper','纸黄']])}</div></div>
    <div class="set-row"><span class="set-row-label">段落排版</span><div class="set-chips"><button type="button" class="pref-chip" data-indent-toggle aria-pressed="${ui.readerIndent!==false}">首行缩进 + 段间距</button></div></div>
    <div class="set-row"><span class="set-row-label">恢复</span><div class="set-chips"><button type="button" class="ghost-btn" data-reset-prefs>重置全部偏好</button><span class="set-foot-hint">清空排版偏好与各书阅读位置；保留最近打开的工作区。</span></div></div>
    <div class="set-divider"></div><div class="set-group">实时预览</div>
    <div class="preview-strip"><div class="preview-tabs"><b>章节进度</b><span>小说正文</span><span>创作资料</span></div><p class="preview-title">「无人认领」</p><p class="preview-text">殡仪馆的灯比白事人家的还亮。我把登记簿翻到第三页，名字栏空着，像一张没开过口的嘴。</p></div>
    <p class="set-foot-hint preview-hint">排版改动即时生效并记忆，无需保存。</p></div>`;
}

export const settingsHead=()=> `<div class="set-head"><h2 id="settings-dialog-title">设置</h2><button type="button" class="icon-btn" data-close-dialog="settings-dialog" aria-label="关闭设置"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button></div>`;

/* 从 v2 偏好提取可编辑载荷（POST body 用；履历与未知键不入请求，由服务端以磁盘为准） */
export const editablePayload=prefs=>{
  const body={preferences:{}};
  for(const key of EDITABLE_KEYS)body.preferences[key]=key==='typicalChapterCount'?prefs[key]:[...prefs[key]];
  return body;
};
