import assert from 'node:assert/strict';
import { extractReadingContent, extractSection, parseChapterSummaries } from '../web/documents.js';

export const tests = [
  ['chapter headings need only summary paragraphs without fixed fields',()=>{
    assert.deepEqual(parseChapterSummaries('# 章节摘要\n\n## 第01章 归家\n\n## 第02章 修伞\n'),[]);
    const result=parseChapterSummaries('# 章节摘要\n\n## 第01章 归家\n\n她留下家门钥匙，决定回来修屋顶。\n\n母亲仍不知道她已离职。\n\n## 第02章 修伞\n');
    assert.equal(result.length,1);assert.equal(result[0].number,1);assert(!result[0].body.includes('###'));
  }],
  ['incomplete structured summaries, common placeholders and commented chapters remain invalid',()=>{
    const invalid=[
      '## 第01章\n### 人物当前处境\n母亲不知道他已离职。\n### 行动条件与未了事项',
      '## 第01章\n### 关键事件与后果\n待补充本章摘要\n### 人物当前处境',
      '## 第01章\n### 关键事件与后果\n```markdown\n```\n### 人物当前处境',
      '## 第01章\n<!--\n## 第02章\n她离开了。\n-->',
    ];
    for(const text of invalid)assert.deepEqual(parseChapterSummaries(text),[],text);
    assert.equal(extractSection('# 资料\n<!--\n## 设定词典\n假设定\n-->\n## 正文\n真正文',['设定词典']).found,false);
    assert.equal(extractSection('```md\n<!--\n```\n## 设定词典\n真实词典',['设定词典']).found,true);
  }],
  ['summary shells and placeholder prose do not count as completed summaries',()=>{
    const shell='## 第01章 归家\n\n### 关键事件与后果\n\n### 人物当前处境\n\n### 行动条件与未了事项\n';
    assert.deepEqual(parseChapterSummaries(shell),[]);
    assert.deepEqual(parseChapterSummaries(shell.replace('### 人物当前处境','[待补充本章摘要]\n<!-- 在此填写真实事件 -->\n### 人物当前处境')),[]);
    assert.deepEqual(parseChapterSummaries(shell.replace('### 行动条件与未了事项','母亲仍不知道他已离职。\n### 行动条件与未了事项')),[]);
    const filled=shell.replace('### 关键事件与后果','### 关键事件与后果\n他卖掉返程票，决定留下修屋顶。');
    assert.equal(parseChapterSummaries(filled)[0].number,1);
    assert.equal(parseChapterSummaries('## 第2章\n他离开了故乡。').length,1);
    assert.equal(parseChapterSummaries('## 第2章\n```md\n## 第9章\n```\n他离开了故乡。').length,1);
  }],
  ['does not treat a fence with trailing info as a closing fence',()=>{
    const text='# 第01章：雨\n## 本章概要\n概要\n## 正文\n开始\n```text\n```not-a-closing-fence\n## 章节备注\n这仍在代码块内\n```\n不能丢掉的真正结尾\n## 章节备注\n实际备注';
    const result=extractReadingContent(text);
    assert(result.markdown.includes('不能丢掉的真正结尾'));
    assert(result.markdown.includes('这仍在代码块内'));
    assert(!result.markdown.includes('实际备注'));
  }],
  ['extracts standard template without counting dialogue or fenced headings as metadata', () => {
    const original='\uFEFF# 第01章：雨\r\n\r\n## 本章概要\r\n剧透\r\n## 章首引子\r\n> 雨来了。\r\n## 正文\r\n他说“章节备注是我的笔记”。\r\n```\r\n## 章节备注\r\n代码不是备注\r\n```\r\n结尾仍在。\r\n## 章节备注\r\n创作备注';
    const result=extractReadingContent(original);
    assert.equal(result.mode,'reading');assert(result.markdown.includes('雨来了'));assert(result.markdown.includes('结尾仍在'));assert(result.markdown.includes('代码不是备注'));assert(!result.markdown.includes('剧透'));assert(!result.markdown.includes('创作备注'));
  }],
  ['keeps nonstandard chapters complete and does not swallow narrative headings', () => {
    for(const text of ['# 第一章\n\n正文，没有模板。','# 第二章\n\n## 正文\n普通散文\n## 尾声\n还要继续']) {
      const result=extractReadingContent(text);assert.equal(result.mode,'full');assert.equal(result.markdown,text);
    }
  }],
  ['extracts fact dictionaries and legacy summaries to the next peer heading', () => {
    const text='# 大纲\n## 章节规划\n规划\n## 设定与事实词典\n|名词|真相|\n|--|--|\n|锁|秘密|\n### 子项\n保留\n## 章节摘要\n### 第1章\n已经发生\n## 其他\n不属于摘要';
    assert.equal(extractSection(text,['设定词典','设定与事实词典']).found,true);
    assert(extractSection(text,['设定与事实词典']).markdown.includes('保留'));
    assert(!extractSection(text,['章节摘要']).markdown.includes('不属于摘要'));
    assert.equal(extractSection('```md\n## 章节摘要\n```',['章节摘要']).found,false);
  }],
];
