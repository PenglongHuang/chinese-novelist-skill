#!/usr/bin/env node
/**
 * 章节字数检查脚本
 * 检查指定章节文件的字数，低于3000字时提示需要扩充
 *
 * 用法:
 *   node check_chapter_wordcount.mjs <章节文件路径> [最小字数] [--json]
 *   node check_chapter_wordcount.mjs --all <目录路径> [最小字数] [--json]
 *
 * 退出码: 0=全部达标  1=有章节不达标  2=文件/目录/参数错误
 * --json: 输出机器可读 JSON（供 Agent 解析写回 02-写作计划.json）；
 *         参数或目录错误时输出 {"error": "..."}；summary.errors 为章节文件错误数
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** 行级输出：与 Python print 一致，'\n' 按平台行尾输出（Windows 为 CRLF） */
function out(text) {
  process.stdout.write(text.replace(/\n/g, os.EOL) + os.EOL);
}

/** 单行错误 JSON：与 Python json.dumps 默认分隔符一致（冒号后带空格） */
function errorJson(msg) {
  return '{"error": ' + JSON.stringify(msg) + '}';
}

function countChineseWords(text) {
  /** 统计中文字数（排除标点符号和Markdown标记） */
  // 移除Markdown标记
  text = text
    .replace(/#{1,6}\s*/g, '')              // 标题
    .replace(/\*\*(.*?)\*\*/g, '$1')        // 粗体
    .replace(/\*(.*?)\*/g, '$1')            // 斜体
    .replace(/~~(.*?)~~/g, '$1')            // 删除线
    .replace(/`(.*?)`/g, '$1')              // 行内代码
    .replace(/\[(.*?)\]\(.*?\)/g, '$1');    // 链接
  // 统计中文字符（汉字）
  const chineseChars = text.match(/[一-鿿]/g);
  return chineseChars ? chineseChars.length : 0;
}

function extractContentFromChapter(filePath) {
  /** 从章节文件中提取正文内容（排除标题等元数据） */
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  // 跳过开头的元数据（如 # 第XX章 标题）
  let contentStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#') && lines[i].includes('章')) {
      contentStart = i + 1;
      break;
    }
  }
  return lines.slice(contentStart).join('\n');
}

function checkChapter(filePath, minWords = 3000) {
  /** 检查单个章节的字数 */
  const file = path.normalize(filePath);
  let exists = false;
  let mainContent;
  try {
    const stat = fs.statSync(filePath);
    exists = true;
    if (!stat.isFile()) {
      return { file, exists, word_count: 0, status: 'error', message: `不是普通文件: ${filePath}` };
    }
    mainContent = extractContentFromChapter(filePath);
  } catch (error) {
    const message = error.code === 'ENOENT'
      ? `文件不存在: ${filePath}`
      : `无法读取章节文件: ${filePath}（${error.code}）`;
    return { file, exists, word_count: 0, status: 'error', message };
  }
  const wordCount = countChineseWords(mainContent);
  const status = wordCount >= minWords ? 'pass' : 'fail';
  const message = `字数: ${wordCount}` + (
    wordCount >= minWords ? ' (✓ 达标)' : ` (✗ 不足，需要至少 ${minWords} 字)`
  );
  return { file, exists, word_count: wordCount, status, message };
}

function chapterNumber(name) {
  /** 提取章节号（无匹配返回 9999，排序时排在最后） */
  const m = name.match(/第(\d+)章/);
  return m ? parseInt(m[1], 10) : 9999;
}

function compareChapters(a, b) {
  /** 按章节号数值排序（避免 第10章 排在 第2章 前面的字符串序问题） */
  const ka = chapterNumber(a);
  const kb = chapterNumber(b);
  if (ka !== kb) return ka - kb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function checkAllChapters(directory, minWords = 3000) {
  /** 检查目录下所有符合模式的章节文件，返回 { results, error } */
  if (!fs.existsSync(directory)) {
    return { results: [], error: `目录不存在 - ${directory}` };
  }
  if (!fs.statSync(directory).isDirectory()) {
    return { results: [], error: `路径不是目录 - ${directory}` };
  }
  const chapterFiles = fs.readdirSync(directory)
    .filter((name) => name.startsWith('第') && name.endsWith('.md'))
    .sort(compareChapters);
  if (chapterFiles.length === 0) {
    return { results: [], error: '目录下没有找到章节文件（模式: 第*.md）' };
  }
  return {
    results: chapterFiles.map((name) => checkChapter(path.join(directory, name), minWords)),
    error: null,
  };
}

function thousands(n) {
  /** 千分位分隔（与 Python 的 format(n, ',') 一致，避免 toLocaleString 的 locale 差异） */
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function printResults(results, minWords = 3000) {
  /** 打印检查结果 */
  if (results.length === 0) {
    out('没有找到章节文件');
    return;
  }
  let totalWords = 0;
  let passed = 0;
  let failed = 0;
  const errors = results.filter((r) => r.status === 'error').length;

  out('\n' + '='.repeat(60));
  out('章节字数检查报告');
  out('='.repeat(60));

  for (const result of results) {
    if (result.status === 'error') {
      out(`\n❌ ${result.file}`);
      out(`   ${result.message}`);
      continue;
    }
    totalWords += result.word_count;
    let icon;
    if (result.status === 'pass') {
      passed++;
      icon = '✅';
    } else {
      failed++;
      icon = '⚠️ ';
    }
    out(`\n${icon} ${path.basename(result.file)}`);
    out(`   ${result.message}`);
  }

  out('\n' + '-'.repeat(60));
  out(`总计: ${results.length} 章 | ${passed} 章达标 | ${failed} 章不足 | ${errors} 章文件错误 | 总字数: ${thousands(totalWords)}`);
  out('-'.repeat(60));

  if (failed > 0) {
    out(`\n⚠️  有 ${failed} 章内容不足 ${minWords} 字，建议使用扩充技巧:`);
    out('   - 添加细节描写（环境、心理、动作）');
    out('   - 增加对话场景');
    out('   - 扩展人物内心活动');
    out('   - 补充背景故事');
    out('\n   参考: references/content-expansion.md');
  }
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');

  const emitError = (msg) => {
    /** 按输出模式打印错误并退出（退出码 2 = 文件/目录/参数错误） */
    out(asJson ? errorJson(msg) : msg);
    process.exit(2);
  };

  const parseMinWords = (raw) => {
    // 与 Python int() 对齐：允许前后空白与正负号，拒绝小数等其他形式
    if (/^\s*[+-]?\d+\s*$/.test(raw)) return parseInt(raw, 10);
    emitError(`最小字数必须是整数，收到 "${raw}"`);
  };

  let minWords = 3000;

  if (args.length === 0) {
    if (asJson) {
      out(errorJson('no arguments'));
      process.exit(2);
    }
    out('用法:');
    out('  检查单个章节: node check_chapter_wordcount.mjs <章节文件路径> [最小字数] [--json]');
    out('  检查所有章节: node check_chapter_wordcount.mjs --all <目录路径> [最小字数] [--json]');
    out('');
    out('退出码: 0=全部达标  1=有章节不达标  2=文件/目录错误');
    out('');
    out('示例:');
    out('  node check_chapter_wordcount.mjs novels/故事/第01章.md');
    out('  node check_chapter_wordcount.mjs novels/故事/第01章.md 3500 --json');
    out('  node check_chapter_wordcount.mjs --all novels/故事 --json');
    process.exit(2);
  }

  let results;
  if (args[0] === '--all') {
    if (args.length < 2) emitError('错误: 使用 --all 时需要指定目录路径');
    const directory = args[1];
    minWords = args.length > 2 ? parseMinWords(args[2]) : 3000;
    const r = checkAllChapters(directory, minWords);
    if (r.error) emitError(`错误: ${r.error}`);
    results = r.results;
  } else {
    const filePath = args[0];
    minWords = args.length > 1 ? parseMinWords(args[1]) : 3000;
    results = [checkChapter(filePath, minWords)];
  }
  const hasError = results.some((result) => result.status === 'error');

  if (asJson) {
    const passed = results.filter((r) => r.exists && r.status === 'pass').length;
    const failed = results.filter((r) => r.exists && r.status === 'fail').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const output = {
      results,
      summary: {
        total: results.length,
        passed,
        failed,
        errors,
        totalWords: results.reduce((sum, r) => sum + r.word_count, 0),
        minWords,
      },
    };
    out(JSON.stringify(output, null, 2));
  } else {
    printResults(results, minWords);
  }

  // 退出码: 2=文件/目录错误, 1=有章节不达标, 0=全部达标
  if (hasError) process.exit(2);
  if (results.some((r) => r.exists && r.status === 'fail')) process.exit(1);
  process.exit(0);
}

main();
