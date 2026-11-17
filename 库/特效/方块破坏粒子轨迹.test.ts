// 方块破坏粒子：守原版个数（整格 4×4×4）、确定性、时钟边界。
import { describe, expect, it } from 'vitest';
import type { Particle } from './粒子物理.ts';
import { collectBreakParticles, spawnBlockBreak } from './方块破坏粒子轨迹.ts';

const uv: [number, number, number, number] = [0, 0, 0.25, 0.25];
const gray: [number, number, number] = [0.6, 0.6, 0.6];

describe('方块破坏粒子', () => {
  it('整格原版 64 个，密度减半每轴 2 份（8 个），薄片每轴至少 2 份', () => {
    expect(spawnBlockBreak([0, 0, 0], [1, 1, 1], uv, gray, 1)).toHaveLength(64);
    expect(spawnBlockBreak([0, 0, 0], [1, 1, 1], uv, gray, 1, 2)).toHaveLength(8);
    expect(spawnBlockBreak([0, 0, 0], [1, 1, 1 / 16], uv, gray, 1)).toHaveLength(4 * 4 * 2);
  });
  it('同一个种子同一把粒子，换种子就变', () => {
    const a = spawnBlockBreak([1, 2, 3], [1, 1, 1], uv, gray, 7);
    expect(spawnBlockBreak([1, 2, 3], [1, 1, 1], uv, gray, 7)).toEqual(a);
    expect(spawnBlockBreak([1, 2, 3], [1, 1, 1], uv, gray, 8)).not.toEqual(a);
  });
  it('崩开以前一个也没有；崩开那一刻全在方块里；寿命过了全没了', () => {
    const ps = spawnBlockBreak([0, 0, 0], [1, 1, 1], uv, gray, 3);
    const before: Particle[] = [];
    collectBreakParticles(ps, -0.01, before);
    expect(before).toHaveLength(0);
    const at0: Particle[] = [];
    collectBreakParticles(ps, 0, at0);
    expect(at0).toHaveLength(64);
    for (const q of at0) for (const v of q.p) expect(Math.abs(v)).toBeLessThan(0.5);
    const late: Particle[] = [];
    collectBreakParticles(ps, 3, late); // 寿命最多 40 刻 = 2 秒
    expect(late).toHaveLength(0);
  });
  it('缩放以 pivot 为中心放大位置和大小', () => {
    const ps = spawnBlockBreak([2, 0, 0], [1, 1, 1], uv, gray, 3);
    const plain: Particle[] = [];
    const scaled: Particle[] = [];
    collectBreakParticles(ps, 0.1, plain);
    collectBreakParticles(ps, 0.1, scaled, 2, [2, 0, 0]);
    expect(scaled[0]!.half).toBeCloseTo(plain[0]!.half * 2, 12);
    expect(scaled[0]!.p[0] - 2).toBeCloseTo((plain[0]!.p[0] - 2) * 2, 12);
  });
});
