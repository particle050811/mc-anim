// 浏览器.ts 靠 Remotion 没导出的 BrowserFetcher；升 Remotion 时这里先报，别等渲染时才炸。
import path from 'node:path';
import { expect, test } from 'vitest';
import { dataPath } from '../环境/配置.ts';
import { expectedVersion, browserLocation, mirrorPack, mirrorPackSha } from './浏览器.ts';

test('期望版本是 Chrome 版本号（Remotion 自己的构建带 -remotion-v 后缀），数据根目录按它分', () => {
  expect(expectedVersion()).toMatch(/^\d+\.\d+\.\d+\.\d+(-remotion-v\d+)?$/);
  const browserLoc = browserLocation();
  expect(browserLoc.目录).toBe(dataPath('cache', '浏览器', expectedVersion()));
  expect(path.basename(browserLoc.exePath)).toMatch(/^chrome-headless-shell(\.exe)?$/);
  expect(browserLoc.exePath.startsWith(browserLoc.目录 + path.sep)).toBe(true);
  expect(path.relative(browserLoc.sourceDir, browserLoc.sourceExe)).toBe(path.relative(browserLoc.目录, browserLoc.exePath));
});

test('国内镜像只换 Google 那份构建的地址，表里没核过 sha 的不走镜像', () => {
  const mirror = mirrorPack('https://镜像.example/cft/');
  if (!expectedVersion().includes('remotion')) {
    expect(mirror?.url).toMatch(/^https:\/\/镜像\.example\/cft\/\d+\.\d+\.\d+\.\d+\/(win64|linux64|mac-x64)\/chrome-headless-shell-(win64|linux64|mac-x64)\.zip$/);
    expect(mirror?.sha).toMatch(/^[0-9a-f]{64}$/);
  } else {
    // Apple 芯片 Mac、新 Linux、Linux ARM 用 Remotion 自己的构建，镜像上没有
    expect(mirror).toBeNull();
  }
  expect(mirrorPack('')).toBeNull();
  // 升 Remotion 换了 Chrome 版本，表要跟着重核
  for (const pkgKey of Object.keys(mirrorPackSha)) expect(pkgKey.startsWith(`${expectedVersion().replace(/-remotion-v\d+$/, '')}/`)).toBe(true);
});
