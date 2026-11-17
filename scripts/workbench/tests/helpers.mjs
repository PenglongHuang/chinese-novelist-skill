import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

export async function fixture() {
  const base = path.resolve(process.env.WORKBENCH_TEST_TEMP || os.tmpdir());
  await fs.mkdir(base, {recursive:true});
  const root = await fs.mkdtemp(path.join(base, 'novel-workbench-'));
  return {
    root,
    async write(relative, content) {
      const target = path.join(root, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, typeof content === 'string' ? content : JSON.stringify(content));
      return target;
    },
    async close() {
      if(path.dirname(path.resolve(root))!==base)throw new Error('Fixture cleanup escaped its temporary directory');
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

/* HTTP 请求助手：返回 {status, headers, body}，供 server/preferences 测试共用 */
export function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end(options.body);
  });
}

export const plan = (name = '同名作品') => ({
  novelName: name, totalChapters: 3, status: 'in_progress', chapters: [
    { chapterNumber: 2, title: '第二章', filePath: '第02章-第二章.md', status: 'completed', wordCount: 3100, wordCountPass: true },
    { chapterNumber: 1, title: '缺失章节', filePath: '第01章-缺失章节.md', status: 'completed', wordCount: 3000 },
  ],
});
