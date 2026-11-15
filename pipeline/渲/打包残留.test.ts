import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { removeBundles } from './打包残留.ts';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-打包残留-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('删掉包，链接指向的数据根不受影响', () => {
  const dataRootDir = path.join(root, '数据根');
  fs.mkdirSync(dataRootDir);
  fs.writeFileSync(path.join(dataRootDir, '留.txt'), '留');
  const bundleDir = path.join(root, 'remotion-webpack-bundle-abc');
  fs.mkdirSync(path.join(bundleDir, 'public'), { recursive: true });
  fs.writeFileSync(path.join(bundleDir, 'bundle.js'), 'x');
  fs.symlinkSync(dataRootDir, path.join(bundleDir, 'public', 'terrain'), 'junction');
  removeBundles(bundleDir);
  expect(fs.existsSync(bundleDir)).toBe(false);
  expect(fs.readFileSync(path.join(dataRootDir, '留.txt'), 'utf8')).toBe('留');
});

test('名字不像 Remotion 的包、不是绝对路径的一律不删', () => {
  const otherDir = path.join(root, '别的目录');
  fs.mkdirSync(otherDir);
  removeBundles(otherDir);
  expect(fs.existsSync(otherDir)).toBe(true);
  removeBundles('http://localhost:3000/remotion-webpack-bundle-abc');
});


test('public 本身是链接也只摘链接，包根被换成链接则不进入', () => {
  const outsideDir = path.join(root, '外面');
  fs.mkdirSync(outsideDir);
  fs.writeFileSync(path.join(outsideDir, '留'), '留');
  const bundleDir = path.join(root, 'remotion-webpack-bundle-public');
  fs.mkdirSync(bundleDir);
  fs.symlinkSync(outsideDir, path.join(bundleDir, 'public'), 'junction');
  removeBundles(bundleDir);
  expect(fs.existsSync(bundleDir)).toBe(false);
  expect(fs.existsSync(path.join(outsideDir, '留'))).toBe(true);
  fs.symlinkSync(outsideDir, bundleDir, 'junction');
  removeBundles(bundleDir);
  expect(fs.lstatSync(bundleDir).isSymbolicLink()).toBe(true);
  expect(fs.existsSync(path.join(outsideDir, '留'))).toBe(true);
});
