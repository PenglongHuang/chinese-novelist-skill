import assert from 'node:assert/strict';
import { fixture, plan, request } from './helpers.mjs';
import { startWorkbench } from '../server.mjs';
import {
  parseCast, quoteBalance, endingShape,
  repeatedPhrases, presence, presenceGaps, catchphraseStats,
  rhythmFlags, buildReport,
} from '../analysis.mjs';

const profile = `# 《测试》人物档案

## 主角

### 沈放

- **说话风格／口头禅**：极少用「我觉得」，多用「行」「不着急」。口头禅是「记一下」。从不主动说「谢谢」。

## 配角

### 麦泰（阿泰）

- **说话风格／口头禅**：开口常是「哥们儿你这是何必」「哥们儿你这是何必」。

### 沈渡（已故，只通过他人与物件出场）

- **说话风格／口头禅**：没有记录。
`;

const style = `# 《测试》文风基准

## 三、负面清单

- **空泛措辞**：「此外」「然而」「值得注意的是」出现即复核。
- **模糊词**：删「一些」「某种」「大概」「似乎」。
- **展示而非讲述**：禁止「他很愤怒」「她很紧张」，改为身体反应。
`;

export const tests = [
  ['parseCast extracts roles, aliases and negation-aware catchphrases', () => {
    const cast = parseCast(profile);
    assert.equal(cast.length, 3);
    const hero = cast.find(m => m.name === '沈放');
    assert.equal(hero.role, '主角');
    assert.deepEqual(hero.catchphrases, ['行', '不着急', '记一下']);
    const tai = cast.find(m => m.name === '麦泰');
    assert.deepEqual(tai.aliases, ['阿泰']);
    assert.equal(tai.catchphrases.length, 1);
    const gone = cast.find(m => m.name === '沈渡');
    assert.deepEqual(gone.aliases, []);
  }],
  ['quoteBalance and endingShape measure text hygiene', () => {
    assert.equal(quoteBalance('「你好」他说「再见').balanced, false);
    assert.equal(quoteBalance('「你好」「再见」').balanced, true);
    const short = endingShape('# 第01章\n\n## 正文\n\n第一段。\n\n他放下杯子。\n\n「你再说一遍。」');
    assert.equal(short.sentences, 1);
    const long = endingShape('# 第01章\n\n## 正文\n\n' + '他放下杯子又拿起来。'.repeat(20));
    assert.ok(long.chars > 140 || long.sentences > 2);
  }],
  ['repeatedPhrases finds planted motifs and collapses substrings', () => {
    const chapter = motif => `# 第01章\n\n## 正文\n\n${'他翻到最后一页看落款。'.repeat(motif)}其他内容各不相同${Math.random()}`;
    const phrases = repeatedPhrases([chapter(3), chapter(4), chapter(2)], { floor: 8 });
    assert.ok(phrases.length >= 1);
    assert.ok(phrases.some(p => p.phrase.includes('最后一页') && p.count >= 8), JSON.stringify(phrases));
    assert.ok(!phrases.some(p => p.phrase === '最后一页看'), 'substrings of a kept phrase collapse');
  }],
  ['parseCast tolerates free-form role sections, spaced names and nameless headings', () => {
    const cast = parseCast(`# 人物档案\n\n## 主角\n\n### Jason Duval（原作）\n\n- **说话风格／口头禅**：口头禅是「行」。\n\n## 对立人物\n\n### Brian Heder（原作）\n\n### （画外音）\n\n- 无独立条目内容。\n`);
    assert.deepEqual(cast.map(m => `${m.name}(${m.role})`), ['Jason Duval(主角)', 'Brian Heder(反派)']);
  }],
  ['presence merges aliases and presenceGaps flags long absences except the hero', () => {
    const cast = parseCast(profile);
    const texts = [1, 2, 3, 4, 5, 6].map(i => `第${i}段 沈放出现。` + (i <= 2 || i === 6 ? '麦泰和阿泰都在。' : '只有别人。'));
    const members = presence(cast, texts);
    const tai = members.find(m => m.name === '麦泰');
    assert.equal(tai.total, 6); /* 3-5 章缺席 */
    const gaps = presenceGaps(members, { gap: 3 });
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].name, '麦泰');
    assert.equal(gaps[0].from, 2); /* 章数组下标 2–4＝第 3–5 段缺席，章号由 buildReport 换算 */
  }],
  ['catchphraseStats counts single-character phrases only as quoted utterances', () => {
    const cast = parseCast(profile);
    const text = '「行。」他说。银行门口排队。不行就算了。「不着急。」';
    const rows = catchphraseStats(cast, [text]);
    assert.equal(rows.find(r => r.phrase === '行').total, 1);
    assert.equal(rows.find(r => r.phrase === '不着急').total, 1);
  }],
  ['rhythmFlags marks below-minimum and deviation chapters', () => {
    const rows = [{ number: 1, words: 2900 }, { number: 2, words: 3100 }, { number: 3, words: 3120 }, { number: 4, words: 3150 }, { number: 5, words: 5200 }];
    const flagged = rhythmFlags(rows, 3000);
    assert.equal(flagged[0].level, 'fix');
    assert.equal(flagged[4].level, 'advise');
    assert.equal(flagged[1].level, null);
  }],
  ['buildReport aggregates findings, rhythm and coverage end to end', async () => {
    const f = await fixture();
    try {
      const gapPlan = {
        novelName: '测试之书', totalChapters: 3, status: 'validating', minWordsPerChapter: 3000, chapters: [
          { chapterNumber: 1, title: '第一章', filePath: '第01章-第一章.md', status: 'completed', wordCount: 3100, wordCountPass: true },
          { chapterNumber: 3, title: '第三章', filePath: '第03章-第三章.md', status: 'completed', wordCount: 3100, wordCountPass: true },
        ],
      };
      await f.write('book/02-写作计划.json', gapPlan);
      await f.write('book/00-人物档案.md', profile);
      await f.write('book/03-文风基准.md', style);
      await f.write('book/99-章节摘要.md', '# 章节摘要\n\n## 第1章 第一章\n\n事件。伏笔：「铁色钥匙」下落不明。\n');
      const body = '# 第01章：第一章\n\n## 正文\n\n' + '「你好」。他说。'.repeat(20) + '\n';
      await f.write('book/第01章-第一章.md', body);
      const { createCatalog } = await import('../catalog.mjs');
      const catalog = await createCatalog(f.root);
      const project = catalog.listProjects()[0];
      const texts = project.chapters.map(c => (c.exists ? body : null));
      const report = buildReport(project, { texts, profileText: profile });
      assert.ok(report.findings.some(x => x.kind === 'numbering' && x.severity === 'fix'), JSON.stringify(report.findings.map(x => x.kind)));
      assert.ok(report.stats.coverage.profile);
      assert.equal(report.checks.length, 12);
      assert.ok(!report.checks.some(c => c.name === '负面清单' || c.name === '伏笔回应'));
      assert.equal(report.rhythm.length, project.chapters.length);
      assert.equal(report.presence.members.length, 3);
    } finally { await f.close(); }
  }],
  ['analysis API serves cached reports and 404 for unknown projects', async () => {
    const f = await fixture(); let server;
    try {
      await f.write('book/02-写作计划.json', plan('接口之书'));
      await f.write('book/第02章-第二章.md', '# 第02章：第二章\n\n## 正文\n\n' + '字'.repeat(3200));
      server = await startWorkbench({ workspace: f.root, intervalMs: 0 });
      const id = JSON.parse((await request(server.url + 'api/projects')).body).projects[0].id;
      const first = await request(server.url + `api/projects/${id}/analysis`);
      assert.equal(first.status, 200);
      const report = JSON.parse(first.body).report;
      assert.ok(report.stats.chapters >= 1);
      assert.ok(Array.isArray(report.findings));
      assert.equal((await request(server.url + `api/projects/${'0'.repeat(20)}/analysis`)).status, 404);
      const second = await request(server.url + `api/projects/${id}/analysis`);
      assert.equal(JSON.parse(second.body).version, JSON.parse(first.body).version);
    } finally { if (server) await server.close(); await f.close(); }
  }],
  ['folder picker endpoint rejects requests without the session token', async () => {
    const f = await fixture(); let server;
    try {
      await f.write('book/02-写作计划.json', plan('选目录'));
      server = await startWorkbench({ workspace: f.root, intervalMs: 0 });
      /* 未带令牌必须在弹出任何系统对话框之前被拒——所以这个用例不会在测试机上弹窗 */
      const denied = await request(server.url + 'api/pick-folder', { method: 'POST', headers: { 'content-type': 'application/json' } });
      assert.equal(denied.status, 403);
    } finally { if (server) await server.close(); await f.close(); }
  }],
];
