import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { 扫打包, 打包保留理由 } from './打包.ts';
import { 执行回收, type 回收计划 } from './计划.ts';
import * as 孤儿 from '../闸/孤儿.ts';

let 根: string;
const 现在 = Date.now(), 旧时 = 现在 - 25 * 3600_000, 空闲 = ' 1 0 123 /sbin/launchd';
beforeEach(() => { 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-打包回收-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(根, { recursive: true, force: true }); });
const 放包 = (名 = 'remotion-webpack-bundle-旧') => {
  const 包 = path.join(根, 名);
  fs.mkdirSync(path.join(包, 'public'), { recursive: true });
  fs.writeFileSync(path.join(包, 'bundle.js'), '旧包');
  for (const p of [path.join(包, 'bundle.js'), path.join(包, 'public'), 包]) fs.utimesSync(p, 旧时 / 1000, 旧时 / 1000);
  return 包;
};
const 计划 = (打包: 回收计划['打包']): 回收计划 => ({ 媒体: [], 临时: [], 暂存: [], 打包, 抽样: [], 草稿: [], 列段: [], webpack: [], 只报: [], 不认识: [], 去重: null, 警告: [] });
const 选项 = { 近期天数: 2, 草稿天数: 14, webpack天数: 3, 列段天数: 90 };

test('超过 24 小时且空闲的才列入可删；新包、链接和无关目录不删', () => {
  const 旧 = 放包(), 新 = 放包('remotion-webpack-bundle-新');
  fs.utimesSync(新, 现在 / 1000, 现在 / 1000);
  放包('不相关');
  fs.symlinkSync(旧, path.join(根, 'remotion-webpack-bundle-链接'), 'junction');
  const 扫 = 扫打包(现在, 根, 空闲);
  expect(扫).toHaveLength(2);
  expect(扫.find(x => x.路径 === 旧)?.理由).toEqual([]);
  expect(扫.find(x => x.路径 === 新)?.理由[0]?.类).toBe('近期');
  expect(fs.existsSync(旧)).toBe(true);
  expect(打包保留理由({ 路径: 旧, 改于: 现在 - 24 * 3600_000 }, 现在, 空闲)[0]?.类).toBe('近期');
});

test.each([
  ['', '算不出'], ['garbled', '算不出'],
  ['33 1 200 chrome --serveUrl=/tmp/remotion-webpack-bundle-旧', '在用'],
  ['33 1 200 chrome --serveUrl=file:///tmp/remotion-webpack-bundle-%E6%97%A7', '在用'],
  ['33 1 200 node /repo/pipeline/cli/main.ts render 核对-冒烟', '算不出'],
  ['33 1 200 /repo/node_modules/.remotion/chrome-headless-shell/mac/chrome-headless-shell', '算不出'],
])('进程在用或无法判断时保守留着：%s', (ps, 类) => {
  expect(打包保留理由({ 路径: 放包(), 改于: 旧时 }, 现在, ps)[0]?.类).toBe(类);
});

test('执行时重读进程与新近时间；真删用删打包，public 链接的目标保留', async () => {
  const 包 = 放包(), 数据 = path.join(根, '数据');
  fs.mkdirSync(数据);
  fs.writeFileSync(path.join(数据, '留下'), '不能删');
  fs.symlinkSync(数据, path.join(包, 'public', 'terrain'), 'junction');
  fs.lutimesSync(path.join(包, 'public', 'terrain'), 旧时 / 1000, 旧时 / 1000);
  fs.utimesSync(path.join(包, 'public'), 旧时 / 1000, 旧时 / 1000);
  const p = 计划(扫打包(现在, 根, 空闲));
  expect(p.打包[0]!.理由).toEqual([]);
  const ps = vi.spyOn(孤儿, '读进程').mockReturnValue(`33 1 200 chrome --serveUrl=${包}`);
  expect((await 执行回收(p, 选项, 现在)).跳过).toHaveLength(1);
  expect(fs.existsSync(包)).toBe(true);
  ps.mockReturnValue(空闲);
  fs.utimesSync(包, 现在 / 1000, 现在 / 1000);
  expect((await 执行回收(p, 选项, 现在)).跳过).toHaveLength(1);
  fs.utimesSync(包, 旧时 / 1000, 旧时 / 1000);
  const r = await 执行回收(p, 选项, 现在);
  expect(r.删数).toBe(1);
  expect(r.失败).toEqual([]);
  expect(fs.existsSync(包)).toBe(false);
  expect(fs.readFileSync(path.join(数据, '留下'), 'utf8')).toBe('不能删');
});
