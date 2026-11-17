// 粒子物理：守路径长度、落地停住、插值晚一刻、随机速度只看随机数串。
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../engine/core/数学.ts';
import { interpPathPos, particleInitVel, particlePath, ParticlePhysics } from './粒子物理.ts';

describe('粒子物理', () => {
  it('路径长 ticks + 1，第 0 项是出生位置，不改传进来的数组', () => {
    const p0: [number, number, number] = [1, 2, 3];
    const path = particlePath(p0, [0.1, 0, 0.2], 12, new ParticlePhysics(1, 0.98));
    expect(path).toHaveLength(13);
    expect(path[0]).toEqual([1, 2, 3]);
    expect(p0).toEqual([1, 2, 3]);
  });
  it('有地面时不穿地，落地后停住不再动', () => {
    const path = particlePath([0, 0, 1], [0.05, 0, 0.1], 200, new ParticlePhysics(1, 0.98, 0));
    for (const p of path) expect(p[2]).toBeGreaterThanOrEqual(0);
    expect(path.at(-1)).toEqual(path.at(-2));
    expect(path.at(-1)![2]).toBe(0);
  });
  it('插值比物理晚一刻：整数刻 k 落在 path[k − 1]，刻 0 和 0 以前在出生点', () => {
    const path = particlePath([0, 0, 0], [0.3, 0.1, 0.4], 10, new ParticlePhysics(1, 0.98));
    expect(interpPathPos(path, 5)).toEqual(path[4]);
    expect(interpPathPos(path, 0)).toEqual(path[0]);
    expect(interpPathPos(path, -3)).toEqual(path[0]);
    expect(interpPathPos(path, 99)).toEqual(path[10]);
  });
  it('随机速度：同一个种子同一个结果，竖直分量多 0.1、水平长度不超过 0.12', () => {
    const a = particleInitVel(mulberry32(42), 0.2, -0.1, 0.3);
    const b = particleInitVel(mulberry32(42), 0.2, -0.1, 0.3);
    expect(a).toEqual(b);
    const len = Math.hypot(a[0], a[1] - 0.1, a[2]);
    expect(len).toBeLessThanOrEqual(0.3 * 0.4 + 1e-12);
  });
});
