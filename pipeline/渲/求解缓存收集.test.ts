import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HeadlessBrowser } from '@remotion/renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ 目录: '' }));
vi.mock('../环境/配置.ts', () => ({ solveCacheDir: () => fake.目录, lightCacheDir: () => path.join(fake.目录, '光体') }));
import { collectSolveCache, waitSolveCacheWrites } from './求解缓存收集.ts';

beforeEach(() => { fake.目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-求解缓存测试-')); });
afterEach(() => { fs.rmSync(fake.目录, { recursive: true, force: true }); vi.restoreAllMocks(); });

it('关页补写缓存并计数，等待完成后字节一致；已有文件不重写', async () => {
  const hashFileName = '0123456789abcdef.json';
  const content = '{"层":"核对","值":{"$f64":"AAAAAAAA8D8="}}';
  const origClose = vi.fn(async () => {});
  let letThrough!: () => void;
  const barrier = new Promise<void>((resolve) => { letThrough = resolve; });
  const browser = { newPage: async () => ({
    _client: () => ({ send: async () => { await barrier; return { result: { value: JSON.stringify({ [hashFileName]: content, '../越界.json': '不能写' }) } }; } }),
    close: origClose,
  }) };
  const stats = collectSolveCache(browser as unknown as HeadlessBrowser);
  const page = await browser.newPage();
  const closing = page.close();
  expect(origClose).not.toHaveBeenCalled();
  letThrough();
  await waitSolveCacheWrites();
  await closing;
  expect(stats.新写).toBe(1);
  const file = path.join(fake.目录, hashFileName);
  expect(fs.readFileSync(file)).toEqual(Buffer.from(content));
  expect(fs.readdirSync(fake.目录)).toEqual([hashFileName]);
  const writeSpy = vi.spyOn(fs, 'writeFileSync');
  await (await browser.newPage()).close();
  await waitSolveCacheWrites();
  expect(writeSpy).not.toHaveBeenCalled();
  expect(stats.新写).toBe(1);
});
