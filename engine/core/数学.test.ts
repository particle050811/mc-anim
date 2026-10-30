// 数学正本：自身的取值，和代表性的旧副本在同一批输入上逐个对（副本从源码里单独取出来编，不执行它所在的模块）。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 取函数, 规范, type 编选项 } from '../../pipeline/检查/副本识别.ts';
import * as M from './数学.ts';

const 根 = path.resolve(import.meta.dirname, '../..');
type 函 = (...a: never[]) => unknown;
const 副本 = (文件: string, 名: string, 选项?: 编选项) => 取函数(文件, fs.readFileSync(path.join(根, 文件), 'utf8'), 名, 选项) as 函;
const 对 = (甲: 函, 乙: 函, 输入: readonly (readonly unknown[])[]) => {
  for (const x of 输入) expect(规范((甲 as (...a: unknown[]) => unknown)(...x)), JSON.stringify(x)).toEqual(规范((乙 as (...a: unknown[]) => unknown)(...x)));
};
const 网格 = (lo: number, hi: number, n: number) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
const 零一 = 网格(0, 1, 20).map((t) => [t]);

describe('数学正本自身', () => {
  it('插值、夹', () => {
    expect(M.lerp(2, 6, 0.25)).toBe(3);
    expect(M.lerp(2, 6, 1.5)).toBe(8);
    expect(M.lerpV([0, 1, 2], [4, 1, -2], 0.5)).toEqual([2, 1, 0]);
    expect(M.invLerp(2, 6, 3)).toBe(0.25);
    expect(M.clamp(7, 2, 4)).toBe(4);
    expect(M.clamp01(-0.5)).toBe(0);
    expect(M.linearstep(2, 6, 3)).toBe(0.25);
    expect(M.linearstep(2, 6, 9)).toBe(1);
  });
  it('smoothstep 一族两头夹住、中点 0.5、两头导数为 0', () => {
    for (const f of [M.smoothstep01, M.smootherstep01, M.easeInOutQuad, M.easeInOutCubic, M.easeInOutSine]) {
      expect(f(-1)).toBeCloseTo(0, 12);
      expect(f(2)).toBeCloseTo(1, 12);
      expect(f(0.5)).toBeCloseTo(0.5, 12);
    }
    expect(M.smoothstep01(0.25)).toBeCloseTo(0.15625, 12);
    expect(M.smootherstep01(0.25)).toBeCloseTo(0.103515625, 12);
    expect(M.smoothstep(10, 20, 12.5)).toBeCloseTo(0.15625, 12);
    expect(M.smootherstep(10, 20, 12.5)).toBeCloseTo(0.103515625, 12);
    const h = 1e-6;
    expect((M.smoothstep01(h) - M.smoothstep01(0)) / h).toBeLessThan(1e-5);
    expect((M.smootherstep01(1) - M.smootherstep01(1 - h)) / h).toBeLessThan(1e-5);
  });
  it('缓动的端点和单调', () => {
    const 们 = [M.easeInQuad, M.easeOutQuad, M.easeInOutQuad, M.easeInCubic, M.easeOutCubic, M.easeInOutCubic, M.easeInSine, M.easeOutSine, M.easeInOutSine];
    for (const f of 们) {
      expect(f(0)).toBeCloseTo(0, 12);
      expect(f(1)).toBeCloseTo(1, 12);
      const 值 = 网格(0, 1, 50).map(f);
      for (let i = 1; i < 值.length; i++) expect(值[i]!).toBeGreaterThanOrEqual(值[i - 1]! - 1e-12);
    }
    expect(M.easeOutQuad(0.5)).toBe(0.75);
    expect(M.easeInCubic(0.5)).toBe(0.125);
  });
  it('hermite：两头的值和切线', () => {
    expect(M.hermite(1, 5, 3, -2, 0)).toBe(1);
    expect(M.hermite(1, 5, 3, -2, 1)).toBe(3);
    const h = 1e-6;
    expect((M.hermite(1, 5, 3, -2, h) - M.hermite(1, 5, 3, -2, 0)) / h).toBeCloseTo(5, 4);
    expect((M.hermite(1, 5, 3, -2, 1) - M.hermite(1, 5, 3, -2, 1 - h)) / h).toBeCloseTo(-2, 4);
    // 切线取两点连线时就是直线
    for (const t of 网格(0, 1, 10)) expect(M.hermite(2, 4, 6, 4, t)).toBeCloseTo(2 + 4 * t, 12);
  });
  it('角度、取余', () => {
    expect(M.rad(180)).toBe(Math.PI);
    expect(M.deg(Math.PI / 2)).toBe(90);
    expect(M.mod(-1, 4)).toBe(3);
    expect(M.mod(9, 4)).toBe(1);
  });
  it('mulberry32：同种子同序列、落在 [0, 1)，种子按 32 位无符号取', () => {
    const a = M.mulberry32(42);
    const b = M.mulberry32(42);
    const 序 = Array.from({ length: 1000 }, () => a());
    expect(序).toEqual(Array.from({ length: 1000 }, () => b()));
    for (const x of 序) expect(x >= 0 && x < 1).toBe(true);
    // mulberry32(42) 的前三个数 × 2³²（第一个是常见的 0.6011037519…）
    const c = M.mulberry32(42);
    expect([c(), c(), c()].map((x) => Math.round(x * 4294967296))).toEqual([2581720956, 1925393290, 3661312704]);
    const d = M.mulberry32(-1);
    const e = M.mulberry32(0xffffffff);
    expect([d(), d()]).toEqual([e(), e()]);
  });
  it('randInt、pick、gaussian', () => {
    const r = M.mulberry32(7);
    const 计 = new Map<number, number>();
    for (let i = 0; i < 6000; i++) {
      const k = M.randInt(r, 2, 4);
      计.set(k, (计.get(k) ?? 0) + 1);
    }
    expect([...计.keys()].sort()).toEqual([2, 3, 4]);
    expect(M.pick(() => 0.99, ['a', 'b', 'c'])).toBe('c');
    const g = M.mulberry32(3);
    const 样 = Array.from({ length: 20000 }, () => M.gaussian(g));
    const 均 = 样.reduce((s, x) => s + x, 0) / 样.length;
    const 方差 = 样.reduce((s, x) => s + (x - 均) ** 2, 0) / 样.length;
    expect(Math.abs(均)).toBeLessThan(0.03);
    expect(Math.abs(方差 - 1)).toBeLessThan(0.05);
    expect(Number.isFinite(M.gaussian(() => 0))).toBe(true);
  });
});

describe('数学正本和旧副本对得上', () => {
  const 三数 = [[0, 10, 0.25], [2, -4, 0.5], [1, 1, 0.3], [-3, 5, 1.5], [5, 7, -0.5]];
  it('lerp', () => {
    对(M.lerp, 副本('作品/应力转动/场/6-古城/6-4-1/编排.ts', 'lerp'), 三数);
    对(M.lerp, 副本('作品/把回忆拼好给你/场/2-末地/编排.ts', '插'), 三数);
    对(M.lerp, 副本('engine/三渲二/调子.ts', '插数'), 三数);
  });
  it('lerpV（三维副本）', () => {
    const 输入 = [[[0, 1, 2], [10, -1, 4], 0.25], [[1, 2, 3], [3, 2, 1], 1.5]];
    对(M.lerpV, 副本('作品/应力转动/地点/边城/6-3-8/编排/工具.ts', 'lerp3'), 输入);
    对(M.lerpV, 副本('作品/把回忆拼好给你/场/2-末地/编排.ts', '插3'), 输入);
  });
  it('clamp01', () => {
    const 输入 = 网格(-1, 2, 12).map((x) => [x]);
    对(M.clamp01, 副本('engine/anim/anim.ts', 'clamp01'), 输入);
    对(M.clamp01, 副本('库/角色/魔法酒狐动作.ts', '夹'), 输入);
  });
  it('smoothstep01：0～1 里和 ss、缓、smooth01 一样（有的副本不夹 t）', () => {
    对(M.smoothstep01, 副本('作品/应力转动/场/6-古城/6-4-1/编排.ts', 'ss'), 零一);
    对(M.smoothstep01, 副本('作品/把回忆拼好给你/场/2-门口/归隐她.ts', '缓'), 零一);
    对(M.smoothstep01, 副本('库/特效/气流.tsx', 'smooth01'), 零一);
    对(M.smoothstep01, 副本('engine/light/大气/云.ts', 'cubicSmooth'), 零一);
  });
  it('smoothstep、smootherstep01、linearstep', () => {
    const 输入 = 网格(-0.5, 1.5, 16).map((x) => [0.2, 0.9, x]);
    对(M.smoothstep, 副本('engine/light/暮色光照.tsx', 'smoothstep'), 输入);
    对(M.linearstep, 副本('engine/light/大气/云.ts', 'linearStep'), 输入);
    对(M.smootherstep01, 副本('engine/flight/真实飞行.ts', 'smootherstep'), 零一);
  });
  it('hermite：同参数顺序的、把回忆的 埃尔米特（切线按帧给、另传段长）', () => {
    const 输入 = [[0, 1, 2, 0, 0.3], [1, -2, 4, 3, 0.75], [5, 0, -1, 0, 0.5]];
    对(M.hermite, 副本('engine/flight/真实飞行/弹簧.ts', 'hermite'), 输入);
    const 埃 = 副本('作品/把回忆拼好给你/场/2-海上/编排.ts', '埃尔米特') as (...a: number[]) => number;
    for (const [p0, p1, m0, m1, h, s] of [[0, 2, 1, 0, 3, 0.3], [1, 4, -2, 3, 1.5, 0.75]] as const)
      expect(埃(p0, p1, m0, m1, h, s)).toBeCloseTo(M.hermite(p0, m0 * h, p1, m1 * h, s), 12);
  });
  it('rad、deg、mod', () => {
    对(M.rad, 副本('engine/anim/anim.ts', 'rad'), [[0], [90], [-45], [33.3]]);
    对(M.deg, 副本('作品/应力转动/场/6-暮色森林/一镜到底/航线求解.ts', 'deg'), [[0], [Math.PI], [-1]]);
    对(M.mod, 副本('作品/应力转动/地点/边城/布局/共用.ts', 'mod'), [[-1, 4], [5, 4], [-9, 4], [3.5, 2]]);
  });
  it('mulberry32：engine/model/parts.tsx 的 rng、边城的 mulberry（| 0 存状态）出的序列一样', () => {
    for (const 种 of [0, 1, 42, 123456789, -5, 2 ** 32 - 1]) {
      for (const 旧 of [副本('engine/model/parts.tsx', 'rng'), 副本('作品/应力转动/地点/边城/布局/共用.ts', 'mulberry')]) {
        const a = M.mulberry32(种);
        const b = (旧 as (s: number) => () => number)(种);
        for (let i = 0; i < 50; i++) expect(b()).toBe(a());
      }
    }
  });
  it('randInt、pick', () => {
    const 输入 = [0, 0.37, 0.5, 0.999].map((u) => [() => u, -3, 3]);
    对(M.randInt, 副本('作品/应力转动/地点/边城/布局/共用.ts', 'ri'), 输入);
    对(M.pick, 副本('engine/model/parts.tsx', 'pick'), [0, 0.37, 0.999].map((u) => [() => u, ['a', 'b', 'c', 'd']]));
  });
});
