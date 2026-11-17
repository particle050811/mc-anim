// 光体缓存的收集：按清单分块取回写盘，已有的不重写，名字不对的不写，读中的超过 1 天才推修改时间。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../环境/配置.ts', () => ({ lightCacheDir: () => '' }));
import { collectLightCachePage } from './光体缓存收集.ts';

let dir = '';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-光体缓存测试-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const fakePage = (files: Record<string, Buffer>, hits: string[]) => {
  const calls: string[] = [];
  const evaluate = async (expr: string) => {
    calls.push(expr);
    if (expr.includes('__lightVolumeCacheList')) return JSON.stringify({ files: Object.entries(files).map(([file, b]) => ({ file, bytes: b.length })), hits });
    const [, file, start, len] = /__lightVolumeCacheChunk\((".*?"), (\d+), (\d+)\)/.exec(expr)!;
    return files[JSON.parse(file!)]!.subarray(Number(start), Number(start) + Number(len)).toString('base64');
  };
  return { evaluate, calls };
};

it('写新的、跳过已有的和名字不对的；读中的旧文件推修改时间', async () => {
  const big = Buffer.alloc(9 * 1024 * 1024 + 5, 7);
  fs.mkdirSync(path.join(dir, '作品甲'));
  fs.writeFileSync(path.join(dir, '作品甲', '1111111111111111.gz'), 'old');
  const old = Date.now() - 3 * 24 * 3600 * 1000;
  fs.utimesSync(path.join(dir, '作品甲', '1111111111111111.gz'), new Date(old), new Date(old));
  const page = fakePage({ '作品甲/0123456789abcdef.gz': big, '作品甲/1111111111111111.gz': Buffer.from('new'), '../越界/0123456789abcdef.gz': Buffer.from('x') }, ['作品甲/1111111111111111.gz']);
  expect(await collectLightCachePage(page.evaluate, dir)).toBe(1);
  expect(fs.readFileSync(path.join(dir, '作品甲', '0123456789abcdef.gz')).equals(big)).toBe(true);
  expect(page.calls.filter((c) => c.includes('Chunk')).length).toBe(2);
  expect(fs.readFileSync(path.join(dir, '作品甲', '1111111111111111.gz'), 'utf8')).toBe('old');
  expect(fs.statSync(path.join(dir, '作品甲', '1111111111111111.gz')).mtimeMs).toBeGreaterThan(old + 1000);
  expect(fs.readdirSync(dir).sort()).toEqual(['作品甲']);
});

it('页面没用光体缓存：什么都不写', async () => {
  expect(await collectLightCachePage(async () => '', dir)).toBe(0);
  expect(fs.readdirSync(dir)).toEqual([]);
});
