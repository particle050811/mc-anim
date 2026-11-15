// 数学正本：自身的取值，和代表性的旧副本在同一批输入上逐个对（副本从源码里单独取出来编，不执行它所在的模块）。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFunction, canonicalValue, type CompileOptions } from '../../pipeline/检查/副本识别.ts';
import * as M from './数学.ts';

const root = path.resolve(import.meta.dirname, '../..');
type AnyFn = (...a: never[]) => unknown;
const copyFn = (file: string, fnName: string, options?: CompileOptions) => getFunction(file, fs.readFileSync(path.join(root, file), 'utf8'), fnName, options) as AnyFn;
const sameOutputs = (fnFirst: AnyFn, secondFn: AnyFn, argsList: readonly (readonly unknown[])[]) => {
  for (const x of argsList) expect(canonicalValue((fnFirst as (...a: unknown[]) => unknown)(...x)), JSON.stringify(x)).toEqual(canonicalValue((secondFn as (...a: unknown[]) => unknown)(...x)));
};
const gridPoints = (lo: number, hi: number, n: number) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
const unitGrid = gridPoints(0, 1, 20).map((t) => [t]);

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
    const easings = [M.easeInQuad, M.easeOutQuad, M.easeInOutQuad, M.easeInCubic, M.easeOutCubic, M.easeInOutCubic, M.easeInSine, M.easeOutSine, M.easeInOutSine];
    for (const f of easings) {
      expect(f(0)).toBeCloseTo(0, 12);
      expect(f(1)).toBeCloseTo(1, 12);
      const value = gridPoints(0, 1, 50).map(f);
      for (let i = 1; i < value.length; i++) expect(value[i]!).toBeGreaterThanOrEqual(value[i - 1]! - 1e-12);
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
    for (const t of gridPoints(0, 1, 10)) expect(M.hermite(2, 4, 6, 4, t)).toBeCloseTo(2 + 4 * t, 12);
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
    const sequence = Array.from({ length: 1000 }, () => a());
    expect(sequence).toEqual(Array.from({ length: 1000 }, () => b()));
    for (const x of sequence) expect(x >= 0 && x < 1).toBe(true);
    // mulberry32(42) 的前三个数 × 2³²（第一个是常见的 0.6011037519…）
    const c = M.mulberry32(42);
    expect([c(), c(), c()].map((x) => Math.round(x * 4294967296))).toEqual([2581720956, 1925393290, 3661312704]);
    const d = M.mulberry32(-1);
    const e = M.mulberry32(0xffffffff);
    expect([d(), d()]).toEqual([e(), e()]);
  });
  it('randInt、pick、gaussian', () => {
    const r = M.mulberry32(7);
    const counts = new Map<number, number>();
    for (let i = 0; i < 6000; i++) {
      const k = M.randInt(r, 2, 4);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([2, 3, 4]);
    expect(M.pick(() => 0.99, ['a', 'b', 'c'])).toBe('c');
    const g = M.mulberry32(3);
    const samples = Array.from({ length: 20000 }, () => M.gaussian(g));
    const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
    const variance = samples.reduce((s, x) => s + (x - mean) ** 2, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(variance - 1)).toBeLessThan(0.05);
    expect(Number.isFinite(M.gaussian(() => 0))).toBe(true);
  });
});

describe('数学正本和旧副本对得上', () => {
  const triples = [[0, 10, 0.25], [2, -4, 0.5], [1, 1, 0.3], [-3, 5, 1.5], [5, 7, -0.5]];
  it('lerp', () => {
    sameOutputs(M.lerp, copyFn('作品/应力转动/场/6-古城/6-4-1/编排.ts', 'lerp'), triples);
    sameOutputs(M.lerp, copyFn('作品/把回忆拼好给你/场/2-末地/编排.ts', '插'), triples);
    sameOutputs(M.lerp, copyFn('engine/三渲二/调子.ts', '插数'), triples);
  });
  it('lerpV（三维副本）', () => {
    const argsList = [[[0, 1, 2], [10, -1, 4], 0.25], [[1, 2, 3], [3, 2, 1], 1.5]];
    sameOutputs(M.lerpV, copyFn('作品/应力转动/地点/边城/6-3-8/编排/工具.ts', 'lerp3'), argsList);
    sameOutputs(M.lerpV, copyFn('作品/把回忆拼好给你/场/2-末地/编排.ts', '插3'), argsList);
  });
  it('clamp01', () => {
    const argsList = gridPoints(-1, 2, 12).map((x) => [x]);
    sameOutputs(M.clamp01, copyFn('engine/anim/anim.ts', 'clamp01'), argsList);
    sameOutputs(M.clamp01, copyFn('库/角色/魔法酒狐动作.ts', '夹'), argsList);
  });
  it('smoothstep01：0～1 里和 ss、缓、smooth01 一样（有的副本不夹 t）', () => {
    sameOutputs(M.smoothstep01, copyFn('作品/应力转动/场/6-古城/6-4-1/编排.ts', 'ss'), unitGrid);
    sameOutputs(M.smoothstep01, copyFn('作品/把回忆拼好给你/场/2-门口/归隐她.ts', '缓'), unitGrid);
    sameOutputs(M.smoothstep01, copyFn('库/特效/气流.tsx', 'smooth01'), unitGrid);
    sameOutputs(M.smoothstep01, copyFn('engine/light/大气/云.ts', 'cubicSmooth'), unitGrid);
  });
  it('smoothstep、smootherstep01、linearstep', () => {
    const argsList = gridPoints(-0.5, 1.5, 16).map((x) => [0.2, 0.9, x]);
    sameOutputs(M.smoothstep, copyFn('engine/light/暮色光照.tsx', 'smoothstep'), argsList);
    sameOutputs(M.linearstep, copyFn('engine/light/大气/云.ts', 'linearStep'), argsList);
    sameOutputs(M.smootherstep01, copyFn('engine/flight/真实飞行.ts', 'smootherstep'), unitGrid);
  });
  it('hermite：同参数顺序的、把回忆的 埃尔米特（切线按帧给、另传段长）', () => {
    const argsList = [[0, 1, 2, 0, 0.3], [1, -2, 4, 3, 0.75], [5, 0, -1, 0, 0.5]];
    sameOutputs(M.hermite, copyFn('engine/flight/真实飞行/弹簧.ts', 'hermite'), argsList);
    const hermiteFn = copyFn('作品/把回忆拼好给你/场/2-海上/编排.ts', '埃尔米特') as (...a: number[]) => number;
    for (const [p0, p1, m0, m1, h, s] of [[0, 2, 1, 0, 3, 0.3], [1, 4, -2, 3, 1.5, 0.75]] as const)
      expect(hermiteFn(p0, p1, m0, m1, h, s)).toBeCloseTo(M.hermite(p0, m0 * h, p1, m1 * h, s), 12);
  });
  it('rad、deg、mod', () => {
    sameOutputs(M.rad, copyFn('engine/anim/anim.ts', 'rad'), [[0], [90], [-45], [33.3]]);
    sameOutputs(M.deg, copyFn('作品/应力转动/场/6-暮色森林/一镜到底/航线求解.ts', 'deg'), [[0], [Math.PI], [-1]]);
    sameOutputs(M.mod, copyFn('作品/应力转动/地点/边城/布局/共用.ts', 'mod'), [[-1, 4], [5, 4], [-9, 4], [3.5, 2]]);
  });
  it('mulberry32：engine/model/parts.tsx 的 rng、边城的 mulberry（| 0 存状态）出的序列一样', () => {
    for (const seed of [0, 1, 42, 123456789, -5, 2 ** 32 - 1]) {
      for (const legacyFn of [copyFn('engine/model/parts.tsx', 'rng'), copyFn('作品/应力转动/地点/边城/布局/共用.ts', 'mulberry')]) {
        const a = M.mulberry32(seed);
        const b = (legacyFn as (s: number) => () => number)(seed);
        for (let i = 0; i < 50; i++) expect(b()).toBe(a());
      }
    }
  });
  it('randInt、pick', () => {
    const argsList = [0, 0.37, 0.5, 0.999].map((u) => [() => u, -3, 3]);
    sameOutputs(M.randInt, copyFn('作品/应力转动/地点/边城/布局/共用.ts', 'ri'), argsList);
    sameOutputs(M.pick, copyFn('engine/model/parts.tsx', 'pick'), [0, 0.37, 0.999].map((u) => [() => u, ['a', 'b', 'c', 'd']]));
  });
});
