// 方块飞溅的运动：守确定性、撞击前后的边界、落地停住、翻滚轴是单位向量、镜头近处淡出、矛管里的格子崩成粒子不飞。
import { describe, expect, it } from 'vitest';
import type { DebrisData, DebrisFace } from './方块碎块面.ts';
import { burstOpen, debrisFrame, landingSec, nearHideAlpha, planChips, spearTubeCells, type DebrisBurst, type DebrisPiece, type SpearTube } from './方块飞溅轨迹.ts';

const stone: DebrisFace = [0, 0, 0.5, 0.5, 128, 128, 128];
const faces = { '+x': stone, '-x': stone, '+y': stone, '-y': stone, '+z': stone, '-z': stone };
// 一面 3×3 的墙（x = 0 平面），全属盒子 0
const wall: DebrisData = { atlas: [], cells: Array.from({ length: 9 }, (_, i) => ({ box: 0, p: [0.5, (i % 3) + 0.5, Math.floor(i / 3) + 0.5], faces })) };
const pieces: DebrisPiece[] = wall.cells.map((cell) => ({ cell, faces }));
const burstAt = (sec: number, extra: Partial<DebrisBurst> = {}): DebrisBurst => ({ sec, dir: [1, 0, 0], origin: [0.5, 1.5, 1.5], speed: 8, spread: 3, seed: 11, chips: 5, ...extra });

describe('方块飞溅轨迹', () => {
  it('撞击前（sec < 0）不画；先藏掉的（hidden）原样画在原位', () => {
    expect(burstOpen(burstAt(-0.1))).toBe(false);
    expect(debrisFrame(pieces, [], [burstAt(-0.1)], [null]).pieces).toHaveLength(0);
    const hidden = debrisFrame(pieces, [], [burstAt(-0.1, { hidden: true })], [null]).pieces;
    expect(hidden).toHaveLength(9);
    for (const pose of hidden) expect(pose.still).toBe(true);
  });
  it('撞开那一刻都在原位、轴是单位向量；之后沿撞击方向飞出去；同输入两次算出来一样', () => {
    const at0 = debrisFrame(pieces, [], [burstAt(0)], [null]).pieces;
    expect(at0).toHaveLength(9);
    for (const pose of at0) {
      expect(pose.still).toBe(false);
      if (pose.still) continue;
      expect(pose.pos).toEqual(wall.cells[pose.index]!.p);
      expect(Math.hypot(...pose.axis)).toBeCloseTo(1, 12);
    }
    const later = debrisFrame(pieces, [], [burstAt(0.3)], [null]);
    for (const pose of later.pieces) expect(pose.pos[0]).toBeGreaterThan(0.5);
    expect(debrisFrame(pieces, [], [burstAt(0.3)], [null])).toEqual(later);
  });
  it('stagger：离撞击中心远的方块晚碎，碎之前还在原位', () => {
    // 正中那格侧向距离 0，按 1 算（也晚 0.2 秒）；角上离中心 √2 格，晚 0.28 秒
    const poses = debrisFrame(pieces, [], [burstAt(0.25, { stagger: 0.2 })], [null]).pieces;
    expect(poses.find((p) => p.index === 4)!.still).toBe(false);
    expect(poses.find((p) => p.index === 0)!.still).toBe(true);
  });
  it('给了地面就落到地面停住（碎块底面不低于地面）', () => {
    const late = debrisFrame(pieces, [], [burstAt(5, { ground: -3 })], [null]).pieces;
    for (const pose of late) expect(pose.pos[2]).toBeCloseTo(-2.5, 9);
    expect(landingSec(1, 0, 16, 0.5)).toBe(Infinity);
    expect(landingSec(1, 0, 16, 0.5, 2)).toBe(Infinity);
    expect(landingSec(2.5, 0, 16, 0.5, 0)).toBeCloseTo(0.5, 12);
  });
  it('小碎渣：每盒 chips 块，来源是同盒的碎块；撞开以后才出现', () => {
    const bursts = [burstAt(0.2)];
    const chips = planChips(pieces, bursts, [null]);
    expect(chips).toHaveLength(5);
    for (const ch of chips) {
      expect(ch.from).toBeGreaterThanOrEqual(0);
      expect(ch.size).toBeGreaterThanOrEqual(0.2);
      expect(ch.size).toBeLessThan(0.45);
    }
    expect(planChips(pieces, bursts, [null])).toEqual(chips);
    expect(debrisFrame(pieces, chips, bursts, [null]).chips).toHaveLength(5);
    expect(debrisFrame(pieces, chips, [burstAt(-0.2)], [null]).chips).toHaveLength(0);
  });
  it('镜头近处：近内 0、远外 1；贴着镜头的碎块不出现在表里', () => {
    const nearHide = { cameraPos: [0, 0, 0], near: 0.6, far: 1.6 };
    expect(nearHideAlpha(undefined, [0, 0, 0], 1)).toBe(1);
    expect(nearHideAlpha(nearHide, [0.5, 0, 0], 0)).toBe(0);
    expect(nearHideAlpha(nearHide, [5, 0, 0], 0)).toBe(1);
    const cam = { ...nearHide, cameraPos: wall.cells[4]!.p };
    const poses = debrisFrame(pieces, [], [burstAt(0)], [null], cam).pieces;
    expect(poses.some((p) => p.index === 4)).toBe(false);
  });
  it('矛管扫到的格子：扫到以前在原位，之后崩成粒子、不再整块飞；同一个管只算一次', () => {
    const tube: SpearTube = { points: [[-1, 1.5, 1.5, -0.1], [2, 1.5, 1.5, 0.2]], radius: 0.4, particleClockScale: 20 };
    const bursts = [burstAt(0.05, { tube })];
    const tubes = spearTubeCells(wall, pieces, bursts);
    expect(tubes[0]!.has(4)).toBe(true);
    expect(tubes[0]!.size).toBe(1);
    expect(spearTubeCells(wall, pieces, [burstAt(0.3, { tube })])[0]).toBe(tubes[0]);
    const before = debrisFrame(pieces, [], [burstAt(-0.05, { tube, hidden: true })], tubes);
    expect(before.pieces.find((p) => p.index === 4)!.still).toBe(true);
    const after = debrisFrame(pieces, [], bursts, tubes);
    expect(after.pieces.some((p) => p.index === 4)).toBe(false);
    expect(after.particles.length).toBeGreaterThan(0);
  });
});
