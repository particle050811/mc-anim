// 数学正本自身的取值（和代表性的旧副本逐个对的在 pipeline/检查/副本对照/数学.test.ts）。
import { describe, expect, it } from 'vitest';
import * as M from './数学.ts';

const gridPoints = (lo: number, hi: number, n: number) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);

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
