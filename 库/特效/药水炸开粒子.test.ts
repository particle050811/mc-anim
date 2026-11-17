// 药水炸开：守个数（8 个碎片 + count 个效果粒子）、确定性、寿命边界、贴图帧逐帧变小。
import { describe, expect, it } from 'vitest';
import { potionSplashAt, potionSplashSpawns } from './药水炸开粒子.ts';

describe('药水炸开粒子', () => {
  it('8 个碎片、count 个效果粒子；同种子同结果，明暗在 0.75～1', () => {
    const a = potionSplashSpawns([1, 2, 3], 40, 100);
    expect(a.chips).toHaveLength(8);
    expect(a.spells).toHaveLength(100);
    expect(potionSplashSpawns([1, 2, 3], 40, 100)).toEqual(a);
    for (const s of a.spells) {
      expect(s.shade).toBeGreaterThanOrEqual(0.75);
      expect(s.shade).toBeLessThanOrEqual(1);
    }
  });
  it('第 0 刻全都在：碎片在落点，效果粒子在落点周围 0.4 格内、高 0.3 格', () => {
    const spawns = potionSplashSpawns([0, 0, 0], 7, 30);
    const at0 = potionSplashAt(spawns, 0);
    expect(at0.chips).toHaveLength(8);
    expect(at0.spells).toHaveLength(30);
    for (const c of at0.chips) expect(c.pos).toEqual([0, 0, 0]);
    for (const s of at0.spells) {
      expect(Math.hypot(s.pos[0], s.pos[1])).toBeLessThanOrEqual(0.4 + 1e-12);
      expect(s.pos[2]).toBeCloseTo(0.3, 12);
      expect(s.frame).toBe(7);
    }
  });
  it('寿命过了就没了（效果粒子最多 40 刻、碎片最多 40 刻）；贴图帧随年龄不增', () => {
    const spawns = potionSplashSpawns([0, 0, 0], 3, 50);
    const late = potionSplashAt(spawns, 40);
    expect(late.spells).toHaveLength(0);
    expect(late.chips).toHaveLength(0);
    let last = new Map<number, number>();
    for (let t = 0; t < 40; t += 0.5) {
      const now = new Map(potionSplashAt(spawns, t).spells.map((s) => [s.index, s.frame]));
      for (const [i, f] of now) if (last.has(i)) expect(f).toBeLessThanOrEqual(last.get(i)!);
      last = now;
    }
  });
});
