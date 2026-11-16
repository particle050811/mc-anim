// 炼狱结界线段表：守住「重放出来是正十二面体」和段数。
import { describe, expect, it } from 'vitest';
import { revelationCageOpacity, cageSphereRadius, cageEdgeTable, cageSegmentTable } from './炼狱结界线.ts';

const pointKey = (p: readonly number[]) => p.map((v) => Math.round(v * 100) / 100 + 0).join(',');

describe('炼狱结界线段表', () => {
  const lineSegs = cageSegmentTable();
  it('2 个整五边形各 5 条、10 个侧面各 4 条，共 50 段', () => {
    expect(lineSegs.length).toBe(50);
  });
  it('端点都在外接球上，并成 20 个顶点、30 条棱（正十二面体），其中 20 条棱画了两遍', () => {
    for (const s of lineSegs) for (const p of [s.start, s.end]) expect(Math.abs(Math.hypot(...p) - cageSphereRadius)).toBeLessThan(2e-3);
    expect(new Set(lineSegs.flatMap((s) => [pointKey(s.start), pointKey(s.end)])).size).toBe(20);
    const edgeCounts = new Map<string, number>();
    for (const s of lineSegs) {
      const k = [pointKey(s.start), pointKey(s.end)].sort().join('|');
      edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
    }
    expect(edgeCounts.size).toBe(30);
    expect([...edgeCounts.values()].filter((n) => n === 2).length).toBe(20);
    expect([...edgeCounts.values()].every((n) => n <= 2)).toBe(true);
  });
  it('棱长都是 2·sin36°', () => {
    for (const s of lineSegs) expect(Math.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1], s.end[2] - s.start[2])).toBeCloseTo(2 * Math.sin(Math.PI / 5), 3);
  });
  it('法线是 (x2−x, 1, y2−y) 转过去的：长度 √(棱长² + 1)，不沿线的方向', () => {
    for (const s of lineSegs) expect(Math.hypot(...s.normal)).toBeCloseTo(Math.hypot(2 * Math.sin(Math.PI / 5), 1), 3);
  });
  it('边比例 0.5 时每段短一截', () => {
    for (const s of cageSegmentTable(0.5)) expect(Math.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1], s.end[2] - s.start[2])).toBeLessThan(0.65);
  });
});

describe('结界棱表', () => {
  it('20 个顶点、30 条棱不重复，每个顶点接 3 条棱', () => {
    const { 顶点: vertices, edges } = cageEdgeTable();
    expect(vertices.length).toBe(20);
    expect(edges.length).toBe(30);
    const binCounts = new Array<number>(20).fill(0);
    for (const [a, b] of edges) {
      binCounts[a]!++;
      binCounts[b]!++;
    }
    expect(binCounts.every((n) => n === 3)).toBe(true);
  });
});

describe('炼狱结界透明度', () => {
  it('30 刻线性淡入，停手后 30 刻线性淡出', () => {
    expect(revelationCageOpacity(15)).toBeCloseTo(0.5);
    expect(revelationCageOpacity(90)).toBe(1);
    expect(revelationCageOpacity(115, 100)).toBeCloseTo(0.5);
    expect(revelationCageOpacity(140, 100)).toBe(0);
  });
});
