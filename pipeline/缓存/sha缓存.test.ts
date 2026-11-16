// sha 缓存：大小、修改时间不变就不重算；存时合并别的进程写的、去掉不在的文件；找重复第二遍全走缓存。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findDuplicates, fileSha } from '../环境/去重.ts';
import { ShaCache } from './sha缓存.ts';

let root = '';
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-sha缓存-')));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const writeFile = (relPath: string, content: string, modifiedAt = Date.parse('2026-10-01T00:00:00Z')) => {
  const f = path.join(root, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  fs.utimesSync(f, new Date(modifiedAt), new Date(modifiedAt));
  return f;
};
const cacheFile = () => path.join(root, 'cache', 'sha缓存.json');

describe('sha缓存', () => {
  it('第二次取同一文件不重算；大小或修改时间变了就重算', async () => {
    const a = writeFile('cache/母版/x/a.mkv', 'aaaa');
    const c = new ShaCache(cacheFile(), root);
    expect(await c.hash(a)).toBe(await fileSha(a));
    c.存();
    const c2 = new ShaCache(cacheFile(), root);
    expect(await c2.hash(a)).toBe(await fileSha(a));
    expect(c2.stats).toMatchObject({ cacheHits: 1, computed: 0 });
    writeFile('cache/母版/x/a.mkv', 'bbbb', Date.parse('2026-10-02T00:00:00Z'));
    expect(c2.取(a)).toBeUndefined();
    expect(await c2.hash(a)).toBe(await fileSha(a));
    expect(c2.stats.computed).toBe(1);
  });

  it('键是相对根的 / 路径；存时合并磁盘上别人新写的、去掉文件已经不在的', async () => {
    const a = writeFile('cache/母版/x/a.mkv', 'aaaa');
    const b = writeFile('cache/母版/x/b.mkv', 'bbbb');
    const cache = new ShaCache(cacheFile(), root);
    const secondCache = new ShaCache(cacheFile(), root);
    await cache.hash(a);
    await secondCache.hash(b);
    cache.存();
    secondCache.存();
    const j = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) as { file: Record<string, unknown> };
    expect(Object.keys(j.file).sort()).toEqual(['cache/母版/x/a.mkv', 'cache/母版/x/b.mkv']);
    fs.rmSync(a);
    new ShaCache(cacheFile(), root).存();
    expect(Object.keys((JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) as { file: object }).file)).toEqual(['cache/母版/x/b.mkv']);
  });

  it('缓存文件坏了就从头算', async () => {
    writeFile('cache/sha缓存.json', '{坏');
    const a = writeFile('cache/母版/x/a.mkv', 'aaaa');
    const c = new ShaCache(cacheFile(), root);
    expect(await c.hash(a)).toBe(await fileSha(a));
    expect(c.stats.computed).toBe(1);
  });

  it('找重复：只看不删（账本不存）时第二遍全走 sha 缓存', async () => {
    const testFiles = ['a', 'b', 'c'].map((n) => {
      const p = writeFile(`cache/母版/x/${n}.mkv`, 'same');
      return { path: p, size: 4, modifiedAt: fs.statSync(p).mtimeMs };
    });
    const fileKey = (p: string) => path.relative(root, p);
    const c1 = new ShaCache(cacheFile(), root);
    const firstGroups = await findDuplicates(testFiles, { version: 1, file: {} }, fileKey, { shaCache: c1 });
    c1.存();
    expect(c1.stats.computed).toBe(3);
    const c2 = new ShaCache(cacheFile(), root);
    const secondGroups = await findDuplicates(testFiles, { version: 1, file: {} }, fileKey, { shaCache: c2 });
    expect(c2.stats).toMatchObject({ cacheHits: 3, computed: 0 });
    expect(secondGroups).toEqual(firstGroups);
  });
});
