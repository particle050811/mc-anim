import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HeadlessBrowser } from '@remotion/renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const 假 = vi.hoisted(() => ({ 目录: '' }));
vi.mock('../环境/配置.ts', () => ({ 求解缓存目录: () => 假.目录 }));
import { 收求解缓存, 等求解缓存写完 } from './求解缓存收集.ts';

beforeEach(() => { 假.目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-求解缓存测试-')); });
afterEach(() => { fs.rmSync(假.目录, { recursive: true, force: true }); vi.restoreAllMocks(); });

it('关页补写缓存并计数，等待完成后字节一致；已有文件不重写', async () => {
  const 文件名 = '0123456789abcdef.json';
  const 内容 = '{"层":"核对","值":{"$f64":"AAAAAAAA8D8="}}';
  const 原关页 = vi.fn(async () => {});
  let 放行!: () => void;
  const 等待 = new Promise<void>((resolve) => { 放行 = resolve; });
  const browser = { newPage: async () => ({
    _client: () => ({ send: async () => { await 等待; return { result: { value: JSON.stringify({ [文件名]: 内容, '../越界.json': '不能写' }) } }; } }),
    close: 原关页,
  }) };
  const 统计 = 收求解缓存(browser as unknown as HeadlessBrowser);
  const page = await browser.newPage();
  const 关页 = page.close();
  expect(原关页).not.toHaveBeenCalled();
  放行();
  await 等求解缓存写完();
  await 关页;
  expect(统计.新写).toBe(1);
  const file = path.join(假.目录, 文件名);
  expect(fs.readFileSync(file)).toEqual(Buffer.from(内容));
  expect(fs.readdirSync(假.目录)).toEqual([文件名]);
  const 写 = vi.spyOn(fs, 'writeFileSync');
  await (await browser.newPage()).close();
  await 等求解缓存写完();
  expect(写).not.toHaveBeenCalled();
  expect(统计.新写).toBe(1);
});
