// 灾变震地的计划和逐帧取样：守确定性、各圈起跳刻、方块粒子个数、圆环寿命、真挪的坑和落块守恒。
import { describe, expect, it } from 'vitest';
import type { V3 } from '../../engine/core/坐标.ts';
import type { DebrisData, DebrisFace } from './方块碎块面.ts';
import { cracksAt, eventsDoneAt, gameQuake, holeFaces, hopBlocksAt, moverPose, planQuake, quakeHideBlocks, quakeParticlesAt, ringAt, type QuakeBoost } from './灾变震地计划.ts';

const dirt: DebrisFace = [0, 0, 0.5, 0.5, 120, 90, 60];
const faces = { '+x': dirt, '-x': dirt, '+y': dirt, '-y': dirt, '+z': dirt, '-z': dirt };
// 一块 31×31 的平地：两层整格，顶面 z = 0
const flat = (): DebrisData => ({
  atlas: [],
  cells: Array.from({ length: 31 * 31 * 2 }, (_, i) => {
    const layer = i % 2;
    const ix = Math.floor(i / 2) % 31;
    const iy = Math.floor(i / 2 / 31);
    return { box: 0, p: [ix - 15 + 0.5, iy - 15 + 0.5, -0.5 - layer], faces };
  }),
});
const center: V3 = [0.5, 0.5, 0];
const realMove: QuakeBoost = { ...gameQuake, rings: [3, 4, 5], density: 0.8, outward: 0.15, takeoff: 2, realMove: true, crackCount: 4 };

describe('灾变震地计划', () => {
  it('同数据同参数取缓存；换一份一样的数据重算，结果逐项相同', () => {
    const data = flat();
    const plan = planQuake(data, center, 8631, gameQuake);
    expect(planQuake(data, center, 8631, gameQuake)).toBe(plan);
    expect(planQuake(flat(), center, 8631, gameQuake)).toEqual(plan);
  });
  it('游戏原样：第 k 圈在第 2 + 2k 刻蹦，蹦之前不画；方块粒子 80～91 个', () => {
    const plan = planQuake(flat(), center, 8631, gameQuake);
    expect(plan.displaced).toBeNull();
    expect(new Set(plan.hops.map((h) => h.startTick))).toEqual(new Set([2, 4, 6, 8, 10, 12, 14, 16]));
    expect(hopBlocksAt(plan, 1.99)).toHaveLength(0);
    expect(hopBlocksAt(plan, 2.5).length).toBe(plan.hops.filter((h) => h.startTick === 2).length);
    expect(plan.particles.length).toBeGreaterThanOrEqual(80);
    expect(plan.particles.length).toBeLessThan(92);
    expect(quakeParticlesAt(plan, 0)).toHaveLength(plan.particles.length);
    expect(quakeParticlesAt(plan, 60)).toHaveLength(0); // 寿命最多 40 刻
  });
  it('蹦块：底面不低于地面，落地 10 刻后消失', () => {
    const plan = planQuake(flat(), center, 8631, gameQuake);
    for (let t = 0; t < 80; t += 0.5) for (const hop of hopBlocksAt(plan, t)) expect(hop.base[2]).toBeGreaterThanOrEqual(0);
    expect(hopBlocksAt(plan, 100)).toHaveLength(0);
  });
  it('圆环：刻 0 大小 0、越来越大越来越淡，第 13 刻起没了；贴图帧不越界', () => {
    expect(ringAt(0, 1, 6)!.half).toBe(0);
    const a = ringAt(3.5, 1, 6)!;
    const b = ringAt(8.5, 1, 6)!;
    expect(b.half).toBeGreaterThan(a.half);
    expect(b.opacity).toBeLessThan(a.opacity);
    expect(ringAt(12.99, 1, 6)!.frame).toBeLessThanOrEqual(5);
    expect(ringAt(13, 1, 6)).toBeNull();
    expect(ringAt(3.5, 2, 6)!.half).toBeCloseTo(a.half * 2, 12);
  });
  it('真挪：落块数 = 蹦起数，藏块表一块一格；事件数随时间不减；蹦走的格子不再盖裂纹', () => {
    const data = flat();
    const plan = planQuake(data, center, 8631, realMove);
    const movers = plan.displaced!.movers;
    expect(movers.length).toBeGreaterThan(0);
    expect(plan.hops).toHaveLength(0);
    expect(quakeHideBlocks(data, center, realMove)).toHaveLength(movers.length);
    const moved = movers.filter((m) => !m.stay);
    expect(moved.every((m) => m.to !== null)).toBe(true);
    const d = plan.displaced!;
    let last = 0;
    for (let t = 0; t <= 300; t += 5) {
      const n = eventsDoneAt(d, t);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(last).toBe(moved.length * 2);
    const crackCells = (t: number) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((n, stage) => n + cracksAt(d, t, stage).length, 0);
    expect(crackCells(300)).toBeLessThan(crackCells(0));
  });
  it('真挪：蹦之前在原位不转，落地以后在落点格心、转完整数个 90°；坑在蹦以后才有面', () => {
    const data = flat();
    const d = planQuake(data, center, 8631, realMove).displaced!;
    const m = d.movers.find((x) => !x.stay)!;
    expect(moverPose(m, m.start - 1)).toEqual({ base: [m.col[0] + 0.5, m.col[1] + 0.5, m.top - 1], angle: 0 });
    const landed = moverPose(m, m.land + 5);
    expect(landed.base[0]).toBeCloseTo(m.to![0], 9);
    expect(landed.base[1]).toBeCloseTo(m.to![1], 9);
    expect(landed.angle).toBeCloseTo((m.turns * Math.PI) / 2, 12);
    const first = Math.min(...d.movers.filter((x) => !x.stay).map((x) => x.start));
    expect(holeFaces(d, data, first - 1).idx).toHaveLength(0);
    expect(holeFaces(d, data, first).idx.length).toBeGreaterThan(0);
  });
});
