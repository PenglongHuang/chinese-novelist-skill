import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

export const plan = (name = '同名作品') => ({
  novelName: name, totalChapters: 3, status: 'in_progress', chapters: [
    { chapterNumber: 2, title: '第二章', filePath: '第02章-第二章.md', status: 'completed', wordCount: 3100, wordCountPass: true },
    { chapterNumber: 1, title: '缺失章节', filePath: '第01章-缺失章节.md', status: 'completed', wordCount: 3000 },
  ],
});
