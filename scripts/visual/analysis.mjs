import { extractReadingContent } from './web/documents.js';

/* 审读引擎：对单部作品做只读分析（人物在场度/口头禅/节奏/重复短语/一致性）。
   纯函数集合，由 catalog 在请求时调用并按作品指纹缓存；不写任何文件。 */

const cjk = char => char >= '一' && char <= '鿿';
const cjkCount = text => (text.match(/[一-鿿]/g) || []).length;

/* ---------- 人物档案解析 ---------- */
/* 档案结构：## 主角/反派/配角 → ### 名字（括注可为别名或备注），正文里有「说话风格／口头禅」行 */
/* 括注里这些词是备注或泛称呼，不是别名：泛称呼（大哥/师父…）会被正文里对任何人的称呼命中，灌水在场度 */
const NOTE_WORDS = new Set(['已故', '去世', '回忆', '番外', '幼年', '老年', '拟写', '待定', '原型', '大哥', '大姐', '师兄', '师姐', '师父', '师傅', '父亲', '母亲', '爸爸', '妈妈', '爷爷', '奶奶', '叔叔', '舅舅', '姑姑', '哥哥', '姐姐', '弟弟', '妹妹', '儿子', '女儿', '妻子', '丈夫', '老板', '老大', '上司', '下属', '同事', '朋友', '助手', '保镖', '管家', '女主', '男主', '主角', '反派', '配角']);
export function parseCast(markdown) {
  const lines = markdown.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const cast = [];
  let role = null, current = null;
  const finish = () => { if (current) cast.push(current); current = null; };
  for (const line of lines) {
    const section = line.match(/^##\s+(.+?)\s*$/);
    if (section) {
      finish();
      const t = section[1];
      /* 角色节名放宽：对立人物/亦敌亦友等自由命名就近归档（主角→反派→配角），未识别的节仍跳过（地点/关系网等不入在场度） */
      role = /^主角/.test(t) ? '主角' : /反派|对立|敌|对手/.test(t) ? '反派' : /^配角/.test(t) ? '配角' : null;
      continue;
    }
    const person = line.match(/^###\s+(.+?)\s*$/);
    if (person) {
      if (!role) continue;
      finish();
      /* 人名允许空格（中英混排如 Jason Duval），括注仍视为别名或备注 */
      const parsed = person[1].match(/^([^（(]+?)(?:[（(](.*)[）)])?\s*$/);
      /* 标题不含人名（纯括注/符号开头等）时跳过此人，不让整份审读报告崩掉 */
      if (!parsed) continue;
      const name = parsed[1].trim();
      const aliases = [];
      if (parsed[2]) for (const token of parsed[2].split(/[,，、/]/)) {
        const value = token.trim();
        if (/^[一-鿿]{1,4}$/.test(value) && !NOTE_WORDS.has(value)) aliases.push(value);
      }
      current = { name, role, aliases, catchphrases: [] };
      continue;
    }
    if (current && line.includes('口头禅')) {
      for (const quoted of line.matchAll(/「([^」]+)」/g)) {
        /* 否定语境（极少用／从不说／避免）里的引语是禁用语，不是口头禅 */
        const before = line.slice(Math.max(0, quoted.index - 6), quoted.index);
        if (/(?:极少|从不|不用|避免|没有|别说|忌)[^」]{0,3}$/.test(before)) continue;
        const phrase = quoted[1].replace(/[。！？…，、；：\s]/g, '');
        if (phrase.length >= 1 && phrase.length <= 8 && [...phrase].every(cjk) && !current.catchphrases.includes(phrase)) current.catchphrases.push(phrase);
      }
    }
  }
  finish();
  return cast;
}

/* ---------- 文本卫生 ---------- */
export function quoteBalance(text) {
  const count = marker => (text.match(new RegExp(marker, 'g')) || []).length;
  const pairs = [['「', '」'], ['『', '』']];
  const broken = pairs.filter(([open, close]) => count(open) !== count(close)).map(([open]) => open);
  return { balanced: broken.length === 0, broken };
}

/* ---------- 章末钩子形态 ---------- */
/* 文风基准要求「章末钩子必须独立成段，最好一句」：看正文最后一段的句数与长度 */
export function endingShape(readingMarkdown) {
  const paragraphs = readingMarkdown.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const last = paragraphs[paragraphs.length - 1] || '';
  /* 引号剥掉再数句：对话结尾的收尾引号不是一句话 */
  const plain = last.replace(/^[>#\s-*]+/, '').replace(/[*_`「」『』“”]/g, '');
  const sentences = plain.split(/[。！？…]+/).filter(s => s.trim());
  return { text: plain, chars: cjkCount(plain), sentences: sentences.length };
}

/* ---------- 高频重复短语（参考：可能是刻意母题） ---------- */
export function repeatedPhrases(chapterTexts, { minLength = 4, maxLength = 12, floor = 4, limit = 12 } = {}) {
  const runs = [];
  for (const text of chapterTexts) {
    for (const run of text.split(/[^一-鿿]+/)) if (run.length >= minLength) runs.push(run);
  }
  /* 两段式：先按最短长度登记种子位置（内存 O(N)），再把达标种子「一致延展」成最长形态。
     若在每个位置枚举全部 4–12 长度，长篇会生成百万级 n-gram 表，同步计算会卡死事件循环。 */
  const positions = new Map();
  for (const run of runs) {
    for (let at = 0; at + minLength <= run.length; at++) {
      const gram = run.slice(at, at + minLength);
      const list = positions.get(gram);
      if (list) list.push(run, at); else positions.set(gram, [run, at]);
    }
  }
  const best = new Map();
  for (const list of positions.values()) {
    const count = list.length / 2;
    if (count < floor) continue;
    let len = minLength;
    while (len < maxLength) {
      let next = null, agree = true;
      for (let i = 0; i < list.length; i += 2) {
        const run = list[i], at = list[i + 1];
        const ch = at + len < run.length ? run[at + len] : null;
        if (ch === null || (next !== null && ch !== next)) { agree = false; break; }
        next = ch;
      }
      if (!agree) break;
      len++;
    }
    const phrase = list[0].slice(list[1], list[1] + len);
    const prev = best.get(phrase);
    if (prev === undefined || count > prev) best.set(phrase, count);
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, limit).map(([phrase, count]) => ({ phrase, count }));
}

/* ---------- 人物在场度 ---------- */
const countOccurrences = (text, needle) => text.split(needle).length - 1;
export function presence(cast, chapterTexts) {
  return cast.map(member => {
    const names = [member.name, ...member.aliases];
    const counts = chapterTexts.map(text => names.reduce((sum, name) => sum + countOccurrences(text, name), 0));
    const total = counts.reduce((a, b) => a + b, 0);
    const chaptersAt = counts.map((n, i) => n > 0 ? i : -1).filter(i => i >= 0);
    return {
      ...member, counts, total,
      first: chaptersAt[0] ?? null, last: chaptersAt[chaptersAt.length - 1] ?? null,
      appearances: chaptersAt.length,
    };
  });
}
/* 断档检测：非主角、此前有戏份，连续 ≥gap 章未出场（首尾天然断档不算）。from/to 为章数组下标，由调用方换算章号 */
export function presenceGaps(members, { gap = 4, priorMentions = 3 } = {}) {
  const findings = [];
  for (const member of members) {
    if (member.role === '主角' || member.total < priorMentions || member.appearances === 0) continue;
    const { counts } = member;
    let absent = 0, seen = 0, run = null;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0) {
        if (absent >= gap && seen >= priorMentions && run) findings.push({ name: member.name, ...run });
        absent = 0; run = null; seen += counts[i];
      } else if (seen >= priorMentions) {
        absent++;
        if (absent === gap) run = { from: i - gap + 1, to: i, chapters: absent };
        else if (run) run.to = i;
      }
    }
  }
  return findings;
}

/* ---------- 口头禅声部核对 ---------- */
/* 单字口头禅（如「行」）裸搜会撞进普通词汇，只在引语内整句匹配 */
export function catchphraseStats(cast, chapterTexts) {
  const rows = [];
  for (const member of cast) {
    for (const phrase of member.catchphrases) {
      const counts = chapterTexts.map(text => {
        if (phrase.length === 1) return (text.match(new RegExp(`「[^」]*${phrase}[。！？…]?」`, 'g')) || []).length;
        return countOccurrences(text, phrase);
      });
      rows.push({ name: member.name, phrase, counts, total: counts.reduce((a, b) => a + b, 0) });
    }
  }
  return rows;
}

/* ---------- 节奏 ---------- */
export function rhythmFlags(rows, minimum) {
  const words = rows.map(r => r.words).filter(n => n > 0).sort((a, b) => a - b);
  const median = words.length ? words[Math.floor(words.length / 2)] : 0;
  return rows.map(row => {
    let level = null;
    if (minimum && row.words !== null && row.words < minimum) level = 'fix';
    else if (median >= 1000 && row.words !== null) {
      const drift = row.words / median;
      if (drift >= 1.45) level = 'advise';
      else if (drift <= 0.62) level = 'advise';
    }
    return { ...row, level };
  });
}

/* ============================================================ 汇总报告 */
/* chapters=catalog 里的章节记录（含 hash/字数/摘要源），texts=对齐的正文文本（可 null） */
export function buildReport(project, { texts, profileText = '' }) {
  const chapters = project.chapters;
  const findings = [];
  const add = (severity, kind, chapter, title, detail) => findings.push({ severity, kind, chapter: chapter ?? null, title, detail });

  /* —— 一致性（需修级） —— */
  const numbers = chapters.map(c => c.number).filter(n => Number.isInteger(n));
  if (numbers.length) {
    const max = Math.max(...numbers), seen = new Map();
    for (const n of numbers) seen.set(n, (seen.get(n) || 0) + 1);
    const gaps = [];
    for (let n = 1; n <= max; n++) if (!seen.has(n)) gaps.push(n);
    const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([n]) => n);
    if (gaps.length) add('fix', 'numbering', gaps[0], `章节编号断档：缺第 ${gaps.join('、')} 章`, '计划或文件中该章号无对应内容，请核对章节文件与写作计划。');
    if (dups.length) add('fix', 'numbering', dups[0], `章节编号重复：第 ${dups.join('、')} 章`, '同一章号对应多个文件或计划条目，请核对。');
  }
  for (const [i, chapter] of chapters.entries()) {
    for (const issue of chapter.syncIssues || []) add('fix', 'sync', chapter.number, `第${chapter.number ?? '?'}章 ${chapter.title}`, issue);
    const text = texts[i];
    if (text) {
      const balance = quoteBalance(text);
      if (!balance.balanced) add('fix', 'quote', chapter.number, `第${chapter.number ?? '?'}章 ${chapter.title}`, `引号不配对（${balance.broken.join('、')} 数量不等），请检查对话排版。`);
    }
    if (chapter.exists && chapter.actualWordCount !== null && project.minWordsPerChapter && chapter.actualWordCount < project.minWordsPerChapter)
      add('fix', 'words', chapter.number, `第${chapter.number ?? '?'}章 ${chapter.title}`, `实际 ${chapter.actualWordCount} 字，低于本章最低门槛 ${project.minWordsPerChapter} 字。`);
    if (chapter.exists && chapter.validatedContentHash && chapter.actualContentHash && chapter.validatedContentHash !== chapter.actualContentHash)
      add('advise', 'hash', chapter.number, `第${chapter.number ?? '?'}章 ${chapter.title}`, '正文在最近一次校验之后又有改动，校验结论可能已过期，建议复检。');
    if (chapter.exists && chapter.summaryHash && chapter.actualSummaryHash && chapter.summaryHash !== chapter.actualSummaryHash)
      add('advise', 'hash', chapter.number, `第${chapter.number ?? '?'}章 ${chapter.title}`, '摘要内容与写作计划中记录的摘要指纹不一致，可能改稿后未同步。');
    if (chapter.recordedStatus === 'completed' && chapter.summarySource === 'missing')
      add('advise', 'summary', chapter.number, `第${chapter.number ?? '?'}章 ${chapter.title}`, '章节已完成但没有可读摘要，影响衔接审查。');
    if (chapter.summaryConflict)
      add('advise', 'summary', chapter.number, `第${chapter.number ?? '?'}章 ${chapter.title}`, '摘要存在多个来源且内容冲突，请以正文为准核对。');
    if (chapter.unplanned)
      add('note', 'plan', chapter.number, `第${chapter.number ?? '?'}章 ${chapter.title}`, '正文文件未列入写作计划。');
  }

  /* —— 解析侧 —— */
  const cast = profileText ? parseCast(profileText) : [];
  const reading = texts.map(text => (text ? extractReadingContent(text).markdown : ''));
  /* 对话统计一次过：每章的引语字数同时供节奏行与总占比使用，避免全书引语双扫 */
  const rhythmRows = [];
  let spokenTotal = 0, charTotal = 0;
  chapters.forEach((chapter, i) => {
    const text = reading[i];
    let dialogue = null;
    if (text) {
      const total = cjkCount(text);
      let spoken = 0;
      for (const quoted of text.matchAll(/「([^」]*)」/g)) spoken += cjkCount(quoted[1]);
      charTotal += total; spokenTotal += spoken;
      dialogue = total ? spoken / total : 0;
    }
    rhythmRows.push({ number: chapter.number, title: chapter.title, id: chapter.id, words: chapter.actualWordCount, dialogue });
  });
  const rhythm = rhythmFlags(rhythmRows, project.minWordsPerChapter);
  const words = rhythm.map(r => r.words).filter(n => n > 0);
  const median = medianOf(words);
  for (const row of rhythm) {
    if (row.level === 'advise' && median)
      add('advise', 'rhythm', row.number, `第${row.number ?? '?'}章 ${row.title}`, `本章 ${row.words} 字，${row.words > median ? '明显长于' : '明显短于'}全书节奏（中位约 ${median} 字），请确认是否刻意。`);
  }

  /* 对话占比异常：以全书中位为参照，过稀的章提醒（叙述型作品阈值不够时不误报） */
  const ratios = rhythm.map(r => r.dialogue).filter(v => v !== null && v > 0).sort((a, b) => a - b);
  const medianRatio = ratios.length >= 5 ? ratios[Math.floor(ratios.length / 2)] : null;
  if (medianRatio && medianRatio >= 0.12) {
    for (const row of rhythm) {
      if (row.dialogue !== null && row.dialogue < medianRatio * 0.4)
        add('advise', 'dialogue', row.number, `第${row.number ?? '?'}章 ${row.title}`, `对话仅占 ${Math.round(row.dialogue * 100)}%，远低于全书中位 ${Math.round(medianRatio * 100)}%；若非刻意安排的静观章，检查是否叙述过载。`);
    }
  }

  const members = cast.length ? presence(cast, reading) : [];
  for (const gap of presenceGaps(members)) {
    const fromNo = chapters[gap.from]?.number ?? gap.from + 1;
    const toNo = chapters[gap.to]?.number ?? gap.to + 1;
    add('advise', 'presence', fromNo, `「${gap.name}」断档`, `第${fromNo}–${toNo}章连续 ${gap.chapters} 章未出场，此前已有戏份；若为刻意留白可忽略。`);
  }
  for (const member of members) if (member.total === 0 && member.role !== '主角')
    add('note', 'presence', null, `「${member.name}」全书未出现`, '档案中登记但正文从未提及，请确认是否遗漏或可从档案精简。');
  /* 末段消失：后四分之一全程缺席且此前有戏份（收尾缺席常是忘了交代） */
  if (chapters.length >= 8) {
    const tailStart = Math.floor(chapters.length * 0.75);
    for (const member of members) {
      if (member.role === '主角' || member.appearances === 0) continue;
      const tailAbsent = member.counts.slice(tailStart).every(n => n === 0);
      const before = member.counts.slice(0, tailStart).reduce((a, b) => a + b, 0);
      if (tailAbsent && before >= 3)
        add('note', 'presence', null, `「${member.name}」后段缺席`, `自第${chapters[tailStart]?.number ?? tailStart + 1}章起再未出场（全书后四分之一）；若非刻意收束，检查是否忘了交代其下落。`);
    }
  }

  const phraseRows = catchphraseStats(cast, reading);
  for (const row of phraseRows) {
    if (row.total === 0) add('advise', 'voice', null, `口头禅「${row.phrase}」未见落实`, `「${row.name}」的档案口头禅全书 0 次，声部特征可能没写出来。`);
    else if (row.total >= 15) add('note', 'voice', null, `口头禅「${row.phrase}」偏密`, `全书出现 ${row.total} 次，注意是否沦为机械复读。`);
  }

  for (const [i, text] of reading.entries()) {
    if (!text) continue;
    const shape = endingShape(text);
    if (shape.sentences > 2 || shape.chars > 140) {
      const chapter = chapters[i];
      add('note', 'ending', chapter.number, `第${chapter.number ?? '?'}章 ${chapter.title}`, `章末段 ${shape.sentences} 句 / ${shape.chars} 字，文风基准建议钩子独立成段、最好一句。`);
    }
  }

  const repeats = repeatedPhrases(reading.filter(Boolean));
  if (repeats.length && repeats[0].count >= 8)
    add('note', 'repeat', null, `高频重复短语 ${repeats.filter(r => r.count >= 8).length} 组`, `最高频「${repeats[0].phrase}」出现 ${repeats[0].count} 次；重复意象若未递进新义，按基准应收敛（详见清单）。`);

  findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || (a.chapter ?? 1e9) - (b.chapter ?? 1e9));

  /* 检查核对带：每项检查最差档位 + 未运行标注（资料缺失） */
  const checkGroups = [['编号连续', ['numbering']], ['状态同步', ['sync']], ['字数门槛', ['words']], ['引号配对', ['quote']], ['校验指纹', ['hash']], ['摘要覆盖', ['summary']], ['节奏突变', ['rhythm']], ['人物在场', ['presence']], ['口头禅声部', ['voice']], ['对话占比', ['dialogue']], ['章末钩子', ['ending']], ['母题重复', ['repeat']]];
  const checks = checkGroups.map(([name, kinds]) => {
    const hits = findings.filter(f => kinds.includes(f.kind));
    return { name, level: hits.length ? hits.reduce((worst, f) => severityRank(f.severity) < severityRank(worst) ? f.severity : worst, hits[0].severity) : 'pass', count: hits.length };
  });
  if (!profileText) { checks.find(c => c.name === '人物在场').level = 'skip'; checks.find(c => c.name === '口头禅声部').level = 'skip'; }

  return {
    stats: {
      chapters: chapters.length, written: reading.filter(Boolean).length,
      words: words.reduce((a, b) => a + b, 0), avg: words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : 0,
      median: median ?? 0, min: project.minWordsPerChapter ?? null,
      dialogue: charTotal ? Math.round(spokenTotal / charTotal * 100) : 0,
      cast: cast.length, findings: { fix: findings.filter(f => f.severity === 'fix').length, advise: findings.filter(f => f.severity === 'advise').length, note: findings.filter(f => f.severity === 'note').length },
      firstPerson: /第一人称/.test(profileText.slice(0, 600)),
      coverage: { profile: !!profileText },
    },
    checks, findings, rhythm,
    presence: { chapters: chapters.map(c => c.number), members: members.map(({ counts, name, role, aliases, total, appearances }) => ({ name, role, aliases, total, appearances, counts })) },
    catchphrases: phraseRows.map(({ name, phrase, total, counts }) => ({ name, phrase, total, counts })),
    repeats,
  };
}

function medianOf(values) {
  const sorted = [...values].filter(n => n > 0).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}
const severityRank = severity => ({ fix: 0, advise: 1, note: 2 }[severity] ?? 3);
