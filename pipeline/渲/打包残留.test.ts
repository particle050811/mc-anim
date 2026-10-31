import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { 删打包 } from './打包残留.ts';

let 根: string;
beforeEach(() => {
  根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-打包残留-'));
});
afterEach(() => fs.rmSync(根, { recursive: true, force: true }));

test('删掉包，链接指向的数据根不受影响', () => {
  const 数据 = path.join(根, '数据根');
  fs.mkdirSync(数据);
  fs.writeFileSync(path.join(数据, '留.txt'), '留');
  const 包 = path.join(根, 'remotion-webpack-bundle-abc');
  fs.mkdirSync(path.join(包, 'public'), { recursive: true });
  fs.writeFileSync(path.join(包, 'bundle.js'), 'x');
  fs.symlinkSync(数据, path.join(包, 'public', 'terrain'), 'junction');
  删打包(包);
  expect(fs.existsSync(包)).toBe(false);
  expect(fs.readFileSync(path.join(数据, '留.txt'), 'utf8')).toBe('留');
});

test('名字不像 Remotion 的包、不是绝对路径的一律不删', () => {
  const 别的 = path.join(根, '别的目录');
  fs.mkdirSync(别的);
  删打包(别的);
  expect(fs.existsSync(别的)).toBe(true);
  删打包('http://localhost:3000/remotion-webpack-bundle-abc');
});
