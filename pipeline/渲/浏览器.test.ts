// 浏览器.ts 靠 Remotion 没导出的 BrowserFetcher；升 Remotion 时这里先报，别等渲染时才炸。
import path from 'node:path';
import { expect, test } from 'vitest';
import { 数据路径 } from '../环境/配置.ts';
import { 期望版本, 浏览器位置, 镜像包, 镜像包sha } from './浏览器.ts';

test('期望版本是 Chrome 版本号（Remotion 自己的构建带 -remotion-v 后缀），数据根目录按它分', () => {
  expect(期望版本()).toMatch(/^\d+\.\d+\.\d+\.\d+(-remotion-v\d+)?$/);
  const 位 = 浏览器位置();
  expect(位.目录).toBe(数据路径('cache', '浏览器', 期望版本()));
  expect(path.basename(位.可执行)).toMatch(/^chrome-headless-shell(\.exe)?$/);
  expect(位.可执行.startsWith(位.目录 + path.sep)).toBe(true);
  expect(path.relative(位.来源目录, 位.来源可执行)).toBe(path.relative(位.目录, 位.可执行));
});

test('国内镜像只换 Google 那份构建的地址，表里没核过 sha 的不走镜像', () => {
  const 包 = 镜像包('https://镜像.example/cft/');
  if (!期望版本().includes('remotion')) {
    expect(包?.url).toMatch(/^https:\/\/镜像\.example\/cft\/\d+\.\d+\.\d+\.\d+\/(win64|linux64|mac-x64)\/chrome-headless-shell-(win64|linux64|mac-x64)\.zip$/);
    expect(包?.sha).toMatch(/^[0-9a-f]{64}$/);
  } else {
    // Apple 芯片 Mac、新 Linux、Linux ARM 用 Remotion 自己的构建，镜像上没有
    expect(包).toBeNull();
  }
  expect(镜像包('')).toBeNull();
  // 升 Remotion 换了 Chrome 版本，表要跟着重核
  for (const 键 of Object.keys(镜像包sha)) expect(键.startsWith(`${期望版本().replace(/-remotion-v\d+$/, '')}/`)).toBe(true);
});
