import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { worktree目录, 不克隆, 依赖做法 } from './开worktree.ts';

const 临时们: string[] = [];
afterEach(() => { for (const d of 临时们.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const 放 = (锁: string | null, 有依赖 = true) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-wt测试-'));
  临时们.push(d);
  if (锁 !== null) fs.writeFileSync(path.join(d, 'package-lock.json'), 锁);
  if (有依赖) fs.mkdirSync(path.join(d, 'node_modules'));
  return d;
};

test('锁文件一样、macOS、主检出有依赖才克隆，否则 npm ci', () => {
  expect(依赖做法(放('{"a":1}'), 放('{"a":1}', false), 'darwin')).toBe('克隆');
  expect(依赖做法(放('{"a":1}'), 放('{"a":2}', false), 'darwin')).toBe('npm ci');
  expect(依赖做法(放('{"a":1}'), 放('{"a":1}', false), 'win32')).toBe('npm ci');
  expect(依赖做法(放('{"a":1}', false), 放('{"a":1}', false), 'darwin')).toBe('npm ci');
  expect(依赖做法(放(null), 放(null, false), 'darwin')).toBe('npm ci');
});

test('不克隆缓存和浏览器；worktree 开在主检出旁边的 mc-anim-wt/', () => {
  expect(不克隆).toEqual(['.cache', '.remotion']);
  expect(worktree目录('/x/mc-anim', '甲')).toBe(path.join('/x', 'mc-anim-wt', '甲'));
});
