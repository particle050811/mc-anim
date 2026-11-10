// 炼狱结界线段表：守住「重放出来是正十二面体」和段数。
import { describe, expect, it } from 'vitest';
import { 炼狱结界透明度, 结界外接球半径, 结界线段表 } from './炼狱结界线.ts';

const 键 = (p: readonly number[]) => p.map((v) => Math.round(v * 100) / 100 + 0).join(',');

describe('炼狱结界线段表', () => {
  const 段 = 结界线段表();
  it('2 个整五边形各 5 条、10 个侧面各 4 条，共 50 段', () => {
    expect(段.length).toBe(50);
  });
  it('端点都在外接球上，并成 20 个顶点、30 条棱（正十二面体），其中 20 条棱画了两遍', () => {
    for (const s of 段) for (const p of [s.起, s.止]) expect(Math.abs(Math.hypot(...p) - 结界外接球半径)).toBeLessThan(2e-3);
    expect(new Set(段.flatMap((s) => [键(s.起), 键(s.止)])).size).toBe(20);
    const 棱 = new Map<string, number>();
    for (const s of 段) {
      const k = [键(s.起), 键(s.止)].sort().join('|');
      棱.set(k, (棱.get(k) ?? 0) + 1);
    }
    expect(棱.size).toBe(30);
    expect([...棱.values()].filter((n) => n === 2).length).toBe(20);
    expect([...棱.values()].every((n) => n <= 2)).toBe(true);
  });
  it('棱长都是 2·sin36°', () => {
    for (const s of 段) expect(Math.hypot(s.止[0] - s.起[0], s.止[1] - s.起[1], s.止[2] - s.起[2])).toBeCloseTo(2 * Math.sin(Math.PI / 5), 3);
  });
  it('法线是 (x2−x, 1, y2−y) 转过去的：长度 √(棱长² + 1)，不沿线的方向', () => {
    for (const s of 段) expect(Math.hypot(...s.法线)).toBeCloseTo(Math.hypot(2 * Math.sin(Math.PI / 5), 1), 3);
  });
  it('边比例 0.5 时每段短一截', () => {
    for (const s of 结界线段表(0.5)) expect(Math.hypot(s.止[0] - s.起[0], s.止[1] - s.起[1], s.止[2] - s.起[2])).toBeLessThan(0.65);
  });
});

describe('炼狱结界透明度', () => {
  it('30 刻线性淡入，停手后 30 刻线性淡出', () => {
    expect(炼狱结界透明度(15)).toBeCloseTo(0.5);
    expect(炼狱结界透明度(90)).toBe(1);
    expect(炼狱结界透明度(115, 100)).toBeCloseTo(0.5);
    expect(炼狱结界透明度(140, 100)).toBe(0);
  });
});
