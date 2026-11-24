import { escapeHtml as e } from './markdown.js';
import { href, number } from './views.js';

/* 审读报告渲染（纯函数）：数据来自 GET /api/projects/:id/analysis。
   全部插值过 e()；图表为纯 CSS 标记 + data-tip 悬停层（CSP 允许）。 */

const severityNames = { fix: '需修', advise: '建议', note: '参考' };

function statTile(label, value, sub = '', cls = '') {
  return `<div class="stat-tile${cls ? ' ' + cls : ''}"><span class="stat-label">${e(label)}</span><strong class="stat-value">${value}</strong>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;
}

const checkLevels = { pass: '通过', fix: '需修', advise: '建议', note: '参考', skip: '未运行' };
const checkShort = { '编号连续': '编号', '状态同步': '同步', '字数门槛': '字数', '引号配对': '引号', '校验指纹': '指纹', '摘要覆盖': '摘要', '节奏突变': '节奏', '人物在场': '人物', '口头禅声部': '声部', '对话占比': '对话', '章末钩子': '钩子', '母题重复': '母题' };
function checkStrip(checks) {
  if (!checks?.length) return '';
  const cells = checks.map(check => `<span class="check-cell lv-${e(check.level)}" data-tip="${e(check.name)}：${e(checkLevels[check.level] || check.level)}${check.count ? ` ${check.count} 条` : ''}">${e(checkShort[check.name] || check.name)}</span>`).join('');
  return `<div class="check-strip" role="list" aria-label="检查项一览">${cells}<span class="check-legend">点色=结果，悬停看详情</span></div>`;
}

function findingRow(f, project) {
  const chapter = f.chapter && project.chapters.find(c => c.number === f.chapter && c.exists);
  const head = chapter
    ? `<a class="finding-link" href="${href(project.id, 'read', chapter.id)}">${e(f.title)}</a>`
    : `<span class="finding-link">${e(f.title)}</span>`;
  return `<li class="finding" data-severity="${e(f.severity)}"><span class="sev-chip">${e(severityNames[f.severity] || f.severity)}</span><div class="finding-body">${head}<p>${e(f.detail)}</p></div></li>`;
}

function findingsBlock(findings, project) {
  const counts = { fix: 0, advise: 0, note: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const major = findings.filter(f => f.severity !== 'note').map(f => findingRow(f, project)).join('');
  const notes = findings.filter(f => f.severity === 'note').map(f => findingRow(f, project)).join('');
  const notesBlock = notes ? `<details class="finding-notes"><summary>参考 ${counts.note} 条（悬而未定的线索，展开细看）</summary><ol class="finding-list">${notes}</ol></details>` : '';
  return `<section class="report-section" aria-label="审读发现">
    <header class="report-head"><h2>发现</h2><p class="report-counts">${counts.fix ? `<span data-sev="fix">需修 ${counts.fix}</span>` : ''}${counts.advise ? `<span data-sev="advise">建议 ${counts.advise}</span>` : ''}${counts.note ? `<span data-sev="note">参考 ${counts.note}</span>` : ''}</p></header>
    ${major ? `<ol class="finding-list">${major}</ol>` : (counts.note ? '' : '<p class="report-empty">未发现值得注意的问题——各项检查均通过。</p>')}
    ${notesBlock}
  </section>`;
}

/* 字数节奏条形图 + 对话密度条带（同一章节轴，两个独立标度） */
function rhythmBlock(rhythm, minimum) {
  const bars = rhythm.filter(r => r.words !== null && r.words !== undefined);
  if (!bars.length) return '';
  const max = Math.max(...bars.map(r => r.words), minimum || 0) * 1.06;
  const step = Math.max(1, Math.ceil(rhythm.length / 14));
  const labels = rhythm.map((r, i) => (r.number % step === 0 || i === rhythm.length - 1) ? `<span class="rhythm-label">${r.number ?? '?'}</span>` : '<span class="rhythm-label" aria-hidden="true"></span>').join('');
  const chart = rhythm.map(r => {
    const words = r.words ?? 0;
    const tip = `第${r.number ?? '?'}章 ${r.title} · ${r.words === null || r.words === undefined ? '无正文' : number(r.words) + ' 字'}${r.level === 'fix' ? ' · 低于门槛' : r.level === 'advise' ? ' · 节奏突变' : ''}`;
    return `<span class="rhythm-mark${r.level ? ' level-' + r.level : ''}${r.words === null || r.words === undefined ? ' blank' : ''}" style="--h:${Math.max(3, Math.round(words / max * 100))}%" data-tip="${e(tip)}"></span>`;
  }).join('');
  const dialogue = rhythm.map(r => {
    const ratio = r.dialogue ?? 0;
    const intensity = Math.min(1, ratio / 0.35);
    const tip = `第${r.number ?? '?'}章 对话占 ${Math.round(ratio * 100)}%`;
    return `<span class="dialogue-cell" style="--ink-a:${Math.round((0.12 + intensity * 0.7) * 100)}%" data-tip="${e(tip)}"></span>`;
  }).join('');
  return `<section class="report-section" aria-label="节奏与对话">
    <header class="report-head"><h2>节奏与对话</h2><p class="report-hint">一格一章${minimum ? `；红线=门槛 ${number(minimum)} 字` : ''}，下条为对话占比、越浓越高，悬停看数值</p></header>
    <div class="rhythm-chart" role="img" aria-label="各章字数与对话占比">${chart}${minimum ? `<span class="rhythm-min" style="bottom:${Math.round(minimum / max * 100)}%" aria-hidden="true"></span>` : ''}</div>
    <div class="dialogue-strip" aria-hidden="true">${dialogue}</div>
    <div class="rhythm-axis">${labels}</div>
  </section>`;
}

/* 人物在场度热力格：行=人物（主角优先），列=章 */
function presenceBlock(presence, { firstPerson }) {
  if (!presence.members.length) return '';
  const members = [...presence.members].sort((a, b) => (a.role === '主角' ? -1 : 0) - (b.role === '主角' ? -1 : 0) || b.total - a.total).slice(0, 10);
  const chapters = presence.chapters;
  const groupSize = chapters.length > 48 ? Math.ceil(chapters.length / 24) : 1;
  const rows = members.map(member => {
    const cells = [];
    for (let i = 0; i < chapters.length; i += groupSize) {
      const sum = member.counts.slice(i, i + groupSize).reduce((a, b) => a + b, 0);
      const range = groupSize > 1 ? `第${chapters[i]}–${chapters[Math.min(i + groupSize, chapters.length) - 1]}章` : `第${chapters[i]}章`;
      const alpha = sum === 0 ? 0 : Math.min(0.82, 0.16 + Math.log2(sum + 1) / 4);
      cells.push(`<span class="presence-cell" style="--ink-a:${Math.round(alpha * 100)}%" data-tip="${e(`${member.name}${member.aliases.length ? '（' + member.aliases.join('／') + '）' : ''} · ${range} · ${sum} 次`)}"></span>`);
    }
    return `<div class="presence-row"><span class="presence-name" data-tip="${e(`${member.name} · ${member.role} · 全书 ${number(member.total)} 次${member.aliases.length ? ' · 含别名 ' + member.aliases.join('／') : ''}`)}">${e(member.name)}<i>${e(member.role)}</i></span>${cells.join('')}</div>`;
  }).join('');
  const axis = [];
  for (let i = 0; i < chapters.length; i += groupSize) axis.push(`<span>${chapters[i]}</span>`);
  return `<section class="report-section" aria-label="人物在场度">
    <header class="report-head"><h2>人物在场度</h2><p class="report-hint">墨色越浓出场越多${firstPerson ? '；第一人称叙述，主角多以「我」出现，其名计数偏低属正常' : ''}</p></header>
    <div class="presence-grid">${rows}<div class="presence-row axis"><span class="presence-name"></span>${axis.join('')}</div></div>
    ${presence.members.length > members.length ? `<p class="report-hint">另有 ${presence.members.length - members.length} 人未列入图（戏份较少），发现栏仍会检查。</p>` : ''}
  </section>`;
}

function catchphraseBlock(rows) {
  if (!rows.length) return '';
  const items = rows.map(row => `<li><span class="cp-name">${e(row.name)}</span><span class="cp-phrase">「${e(row.phrase)}」</span><strong class="cp-count">${number(row.total)}</strong><span class="cp-spread">见于 ${row.counts.filter(n => n > 0).length} 章</span></li>`).join('');
  return `<section class="report-section" aria-label="口头禅声部">
    <header class="report-head"><h2>口头禅声部</h2><p class="report-hint">出自人物档案，在正文中的落实次数</p></header>
    <ul class="cp-list">${items}</ul>
  </section>`;
}

function repeatsBlock(repeats) {
  if (!repeats.length) return '';
  const items = repeats.map(r => `<li><span class="rp-phrase">「${e(r.phrase)}」</span><strong>×${number(r.count)}</strong></li>`).join('');
  return `<section class="report-section" aria-label="高频重复短语">
    <header class="report-head"><h2>重复短语</h2><p class="report-hint">全书高频片段——刻意的母题会自然浮出，机械复读也会</p></header>
    <ul class="rp-list">${items}</ul>
  </section>`;
}

export function reportView(project, report) {
  const { stats, checks, findings, rhythm, presence, catchphrases, repeats } = report;
  const tiles = `
    ${statTile('正文', `${number(stats.written)}<small> / ${number(stats.chapters)} 章</small>`)}
    ${statTile('总字数', number(stats.words), `平均 ${number(stats.avg)} · 中位 ${number(stats.median)}`)}
    ${statTile('对话占比', stats.dialogue + '<small>%</small>', '引语内字数 / 全书')}
    ${statTile('发现', `${stats.findings.fix ? `<span class="st-fix">${stats.findings.fix}</span>` : '<span class="st-ok">0</span>'}`, `建议 ${stats.findings.advise} · 参考 ${stats.findings.note}`)}`;
  const coverage = stats.coverage.profile ? '' : '未找到人物档案（00-人物档案.md），人物在场度与口头禅未运行';
  return `<section class="report-view" aria-label="审读报告">
    <p class="report-lead">「审读为机械比对，只供参照；一切以你的判断为准。」</p>
    <div class="report-stats">${tiles}</div>
    ${checkStrip(checks)}
    ${coverage ? `<div class="report-coverage"><p>${e(coverage)}</p></div>` : ''}
    ${findingsBlock(findings, project)}
    ${rhythmBlock(rhythm, stats.min)}
    ${presenceBlock(presence, stats)}
    ${catchphraseBlock(catchphrases)}
    ${repeatsBlock(repeats)}
    <div id="report-tip" class="chart-tip" hidden></div>
  </section>`;
}

export function reportLoading() {
  return `<section class="report-view" aria-label="审读报告"><p class="report-empty">正在审读全书…</p></section>`;
}
