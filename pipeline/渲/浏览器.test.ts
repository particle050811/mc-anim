// 浏览器.ts 靠 Remotion 没导出的 BrowserFetcher；升 Remotion 时这里先报，别等渲染时才炸。
import path from 'node:path';
import { expect, test } from 'vitest';
import { 数据路径 } from '../环境/配置.ts';
import { 期望版本, 浏览器位置 } from './浏览器.ts';

test('期望版本是 Remotion 带补丁的构建号，数据根目录按它分', () => {
  expect(期望版本()).toMatch(/^\d+\.\d+\.\d+\.\d+-remotion-v\d+$/);
  const 位 = 浏览器位置();
  expect(位.目录).toBe(数据路径('cache', '浏览器', 期望版本()));
  expect(path.basename(位.可执行)).toMatch(/^chrome-headless-shell(\.exe)?$/);
  expect(位.可执行.startsWith(位.目录 + path.sep)).toBe(true);
  expect(path.relative(位.来源目录, 位.来源可执行)).toBe(path.relative(位.目录, 位.可执行));
});
