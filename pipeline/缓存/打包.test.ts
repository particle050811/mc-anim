import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { scanBundles, bundleKeepReasons } from './打包.ts';
import { runReclaim, type ReclaimPlan } from './计划.ts';
import * as orphanModule from '../闸/孤儿.ts';

let root: string;
const now = Date.now(), oldTime = now - 25 * 3600_000, psText = ' 1 0 123 /sbin/launchd';
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-打包回收-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const makeBundle = (dirName = 'remotion-webpack-bundle-旧') => {
  const bundleDir = path.join(root, dirName);
  fs.mkdirSync(path.join(bundleDir, 'public'), { recursive: true });
  fs.writeFileSync(path.join(bundleDir, 'bundle.js'), '旧包');
  for (const p of [path.join(bundleDir, 'bundle.js'), path.join(bundleDir, 'public'), bundleDir]) fs.utimesSync(p, oldTime / 1000, oldTime / 1000);
  return bundleDir;
};
const makePlan = (bundleDirs: ReclaimPlan['打包']): ReclaimPlan => ({ media: [], tempFiles: [], staging: [], 打包: bundleDirs, drafts: [], columnSegs: [], webpack: [], reportOnly: [], unknownGroups: [], dedupePlan: null, warnings: [] });
const options = { recentDays: 2, draftDays: 14, webpackDays: 3, columnSegDays: 90 };

test('超过 24 小时且空闲的才列入可删；新包、链接和无关目录不删', () => {
  const oldBundle = makeBundle(), newBundle = makeBundle('remotion-webpack-bundle-新');
  fs.utimesSync(newBundle, now / 1000, now / 1000);
  makeBundle('不相关');
  fs.symlinkSync(oldBundle, path.join(root, 'remotion-webpack-bundle-链接'), 'junction');
  const bundles = scanBundles(now, root, psText);
  expect(bundles).toHaveLength(2);
  expect(bundles.find(x => x.path === oldBundle)?.reason).toEqual([]);
  expect(bundles.find(x => x.path === newBundle)?.reason[0]?.type).toBe('近期');
  expect(fs.existsSync(oldBundle)).toBe(true);
  expect(bundleKeepReasons({ path: oldBundle, modifiedAt: now - 24 * 3600_000 }, now, psText)[0]?.type).toBe('近期');
});

test.each([
  ['', '算不出'], ['garbled', '算不出'],
  ['33 1 200 chrome --serveUrl=/tmp/remotion-webpack-bundle-旧', '在用'],
  ['33 1 200 chrome --serveUrl=file:///tmp/remotion-webpack-bundle-%E6%97%A7', '在用'],
  ['33 1 200 node /repo/pipeline/cli/main.ts render 核对-冒烟', '算不出'],
  ['33 1 200 /repo/node_modules/.remotion/chrome-headless-shell/mac/chrome-headless-shell', '算不出'],
  ['33 1 200 /d/mc-anim-data/cache/浏览器/157.0.8080.0-remotion-v3/chrome-headless-shell-mac-arm64/chrome-headless-shell', '算不出'],
])('进程在用或无法判断时保守留着：%s', (ps, keepKind) => {
  expect(bundleKeepReasons({ path: makeBundle(), modifiedAt: oldTime }, now, ps)[0]?.type).toBe(keepKind);
});

test('执行时重读进程与新近时间；真删用删打包，public 链接的目标保留', async () => {
  const bundleDir = makeBundle(), dataDir = path.join(root, '数据');
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, '留下'), '不能删');
  fs.symlinkSync(dataDir, path.join(bundleDir, 'public', 'terrain'), 'junction');
  fs.lutimesSync(path.join(bundleDir, 'public', 'terrain'), oldTime / 1000, oldTime / 1000);
  fs.utimesSync(path.join(bundleDir, 'public'), oldTime / 1000, oldTime / 1000);
  const p = makePlan(scanBundles(now, root, psText));
  expect(p.打包[0]!.reason).toEqual([]);
  const ps = vi.spyOn(orphanModule, '读进程').mockReturnValue(`33 1 200 chrome --serveUrl=${bundleDir}`);
  expect((await runReclaim(p, options, now)).skipped).toHaveLength(1);
  expect(fs.existsSync(bundleDir)).toBe(true);
  ps.mockReturnValue(psText);
  fs.utimesSync(bundleDir, now / 1000, now / 1000);
  expect((await runReclaim(p, options, now)).skipped).toHaveLength(1);
  fs.utimesSync(bundleDir, oldTime / 1000, oldTime / 1000);
  const r = await runReclaim(p, options, now);
  expect(r.deletedCount).toBe(1);
  expect(r.failed).toEqual([]);
  expect(fs.existsSync(bundleDir)).toBe(false);
  expect(fs.readFileSync(path.join(dataDir, '留下'), 'utf8')).toBe('不能删');
});
