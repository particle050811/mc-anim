import { describe, expect, test } from 'vitest';
import { pickSections, sectionKey, type SectionId } from './区段.ts';
import { RouteTable, diffPicks, routeDecide, type RouteView } from './航线定级.ts';

// 假航线：镜头在 150 米高沿 +x 每秒飞 400 米，往前看 90°（左右各 45°）；地面平的
const speed = 400;
const pixelAngle = 1.43e-3;
const splitPixels = 0.75;
const farM = 6000;
const featureTop = () => 0;
const coarsestLevel = 6;
const viewAt = (sec: number): RouteView => {
  const cx = speed * sec;
  return { camPos: [cx, 0, 150], pixelAngle, inView: (x0, y0, x1, y1) => x1 > cx && y1 > -(x1 - cx) && y0 < x1 - cx };
};
const cut: [number, number] = [0.5, 6.5];
const newTable = (lookSec: number, hold: boolean) => new RouteTable({ lookSec, hold, gridHz: 64, splitPixels, farM, featureTop, coarsestLevel, viewAt });
const plain = (sec: number) => pickSections({ ...viewAt(sec), splitPixels, farM, featureTop, coarsestLevel });
const routed = (table: RouteTable, sec: number) => {
  const force = table.forFrame(sec, cut[0], cut[1]);
  return pickSections({ ...viewAt(sec), splitPixels, farM, featureTop, coarsestLevel, decide: routeDecide(force, 0) });
};
const routedWithFloor = (table: RouteTable, sec: number, floorPixels: number) => pickSections({ ...viewAt(sec), splitPixels, farM, featureTop, coarsestLevel, decide: routeDecide(table.forFrame(sec, cut[0], cut[1]), floorPixels) });
// 这一块自己的一格在镜头里几个像素（同 pickSections 的距离算法：到区段盒子最近点，地面高 0）
const cellPixelsAt = (sec: number, q: SectionId) => {
  const size = 64 * 2 ** q.L;
  const [cx, cy, cz] = viewAt(sec).camPos as [number, number, number];
  const dist = Math.max(Math.hypot(Math.max(q.i * size - cx, 0, cx - (q.i + 1) * size), Math.max(q.j * size - cy, 0, cy - (q.j + 1) * size), cz), 1);
  return 2 ** q.L / (dist * pixelAngle);
};
const keys = (list: SectionId[]) => list.map(sectionKey).sort().join(' ');
const frames60 = Array.from({ length: 121 }, (_, k) => 2 + k / 60);

describe('航线定级', () => {
  test('不往后看、不留细：和照门槛挑的一样', () => {
    const table = newTable(0, false);
    for (const sec of [0.5, 1.234, 3, 6.5]) expect(keys(routed(table, sec))).toBe(keys(plain(sec)));
  });

  test.each([
    [1, false],
    [1, true],
    [Infinity, false],
    [Infinity, true],
    [0, true],
  ])('是帧号的纯函数：往后看 %s 秒、留细 %s，顺着、倒着、跳着、每帧新开一张表都一样', (lookSec, hold) => {
    const forward = newTable(lookSec, hold);
    const expected = frames60.map((sec) => keys(routed(forward, sec)));
    const backward = newTable(lookSec, hold);
    [...frames60.keys()].reverse().forEach((k) => expect(keys(routed(backward, frames60[k]!))).toBe(expected[k]));
    const jumping = newTable(lookSec, hold);
    for (const k of [77, 3, 120, 40, 41, 0, 99, 4]) expect(keys(routed(jumping, frames60[k]!))).toBe(expected[k]);
    for (const k of [0, 60, 120]) expect(keys(routed(newTable(lookSec, hold), frames60[k]!))).toBe(expected[k]);
  });

  test('往后看：往后 T 秒里格点上要细分的块，现在在视野里就已经细分', () => {
    const table = newTable(1, false);
    const now = routed(table, 2);
    const nowKeys = new Set(now.map(sectionKey));
    // 2.5 秒在格点上（32/64）；那时画的每一块，现在要么同一块、要么更细，不会是它的上级
    for (const q of plain(2.5)) {
      let { L, i, j } = q;
      for (;;) {
        L++;
        i = Math.floor(i / 2);
        j = Math.floor(j / 2);
        if (L > 6) break;
        expect(nowKeys.has(sectionKey({ L, i, j }))).toBe(false);
      }
    }
    // 确实比照门槛的细
    expect(now.length).toBeGreaterThan(plain(2).length);
  });

  test('整段 + 留细：帧落在格点上时，视野里的区段一帧都不换级', () => {
    const table = newTable(Infinity, true);
    let prev = routed(table, 1);
    let plainSwitches = 0;
    for (let m = 65; m <= 64 * 6; m++) {
      const cur = routed(table, m / 64);
      expect(diffPicks(prev, cur)).toEqual([]);
      plainSwitches += diffPicks(plain((m - 1) / 64), plain(m / 64)).length;
      prev = cur;
    }
    expect(plainSwitches).toBeGreaterThan(50); // 照门槛挑的同一段在换级，对照有意义
  });

  test('下限：提前细分出来的一格不小于下限，区段数夹在照门槛和不设下限之间，还是纯函数', () => {
    const floorPixels = 0.4;
    const table = newTable(Infinity, true);
    const plainKeys = new Set(plain(2).map(sectionKey));
    const floored = routedWithFloor(table, 2, floorPixels);
    for (const q of floored) if (!plainKeys.has(sectionKey(q))) expect(cellPixelsAt(2, q)).toBeGreaterThanOrEqual(floorPixels * 0.5); // 一块里远近不一样，留一半余量
    expect(floored.length).toBeGreaterThan(plain(2).length);
    expect(floored.length).toBeLessThan(routed(table, 2).length);
    expect(keys(routedWithFloor(newTable(Infinity, true), 2, floorPixels))).toBe(keys(floored));
    // 下限 ≥ 门槛：提前细分一块都不剩
    expect(keys(routedWithFloor(table, 2, splitPixels))).toBe(keys(plain(2)));
  });

  test('只留细：视野里的区段不变粗', () => {
    // 镜头先往前再倒退：照门槛会变粗，留细不会
    const backAndForth = (sec: number): RouteView => viewAt(sec < 3 ? sec : 6 - sec);
    const table = new RouteTable({ lookSec: 0, hold: true, gridHz: 64, splitPixels, farM, featureTop, coarsestLevel, viewAt: backAndForth });
    const pick = (sec: number) => {
      const force = table.forFrame(sec, 0.5, 5.5);
      return pickSections({ ...backAndForth(sec), splitPixels, farM, featureTop, coarsestLevel, decide: (level, i, j, wants) => wants || force(level, i, j) });
    };
    let prev = pick(1);
    let plainCoarsen = 0;
    for (let m = 65; m <= 64 * 5; m++) {
      const cur = pick(m / 64);
      expect(diffPicks(prev, cur).filter((s) => s.kind === 'coarsen')).toEqual([]);
      plainCoarsen += diffPicks(pickSections({ ...backAndForth((m - 1) / 64), splitPixels, farM, featureTop, coarsestLevel }), pickSections({ ...backAndForth(m / 64), splitPixels, farM, featureTop, coarsestLevel })).filter((s) => s.kind === 'coarsen').length;
      prev = cur;
    }
    expect(plainCoarsen).toBeGreaterThan(20);
  });

  test('航线函数不是航线秒的纯函数：报错，不悄悄用错表', () => {
    let drift = 0;
    const table = new RouteTable({ lookSec: 1, hold: false, gridHz: 64, splitPixels, farM, featureTop, coarsestLevel, viewAt: (sec) => viewAt(sec + drift) });
    table.forFrame(2, cut[0], cut[1]);
    drift = 0.01;
    expect(() => table.forFrame(2.1, cut[0], cut[1])).toThrow(/不是航线秒的纯函数/);
  });

  test('截头截尾差在浮点末位：格点范围不变（不重建表）', () => {
    const table = newTable(1, true);
    routed(table, 2);
    const before = table.sampleCount;
    const force = table.forFrame(2, cut[0] + 1e-13, cut[1] - 1e-13);
    expect(table.sampleCount).toBe(before);
    expect(typeof force(3, 0, 0)).toBe('boolean');
  });

  test('canSplit：不能细分的块停在那一级，照门槛挑和航线定级都不越过', () => {
    // 只有 y ≥ 0 那一半能往下分到第 2 级，再细没有；y < 0 那一半只有第 4 级以上
    const canSplit = (level: number, _i: number, j: number) => (j >= 0 ? level > 2 : level > 4);
    const check = (list: SectionId[]) => {
      expect(list.length).toBeGreaterThan(0);
      for (const q of list) expect(q.L).toBeGreaterThanOrEqual(q.j >= 0 ? 2 : 4);
    };
    const sec = 3;
    const limited = pickSections({ ...viewAt(sec), splitPixels, farM, featureTop, coarsestLevel, canSplit });
    check(limited);
    // 不限的时候这两半都挑得到更细的，说明上面是 canSplit 拦下的
    expect(plain(sec).some((q) => q.j >= 0 && q.L < 2)).toBe(true);
    expect(plain(sec).some((q) => q.j < 0 && q.L < 4)).toBe(true);
    // 没被拦到的地方和不限时一样
    expect(keys(limited.filter((q) => q.j >= 0 && q.L > 2))).toBe(keys(plain(sec).filter((q) => q.j >= 0 && q.L > 2)));
    const table = new RouteTable({ lookSec: 2, hold: true, gridHz: 64, splitPixels, farM, featureTop, coarsestLevel, canSplit, viewAt });
    for (const at of [2, 3.5, 5]) check(pickSections({ ...viewAt(at), splitPixels, farM, featureTop, coarsestLevel, canSplit, decide: routeDecide(table.forFrame(at, cut[0], cut[1]), 0) }));
  });

  test('最粗级 8（一块 16 公里）：远处都要细分时挑出的和最粗级 6 一样；都不细分时停在第 8 级', () => {
    for (const sec of [0, 2.5]) expect(keys(pickSections({ ...viewAt(sec), splitPixels, farM, featureTop, coarsestLevel: 8 }))).toBe(keys(plain(sec)));
    const coarse = pickSections({ ...viewAt(1), pixelAngle: 10, splitPixels, farM, featureTop, coarsestLevel: 8 });
    expect(coarse.length).toBeGreaterThan(0);
    expect(coarse.every((q) => q.L === 8)).toBe(true);
    const table = new RouteTable({ lookSec: 1, hold: true, gridHz: 64, splitPixels, farM, featureTop, coarsestLevel: 8, viewAt });
    expect(keys(pickSections({ ...viewAt(2), splitPixels, farM, featureTop, coarsestLevel: 8, decide: routeDecide(table.forFrame(2, cut[0], cut[1]), 0) }))).toBe(keys(routed(newTable(1, true), 2)));
  });

  test('diffPicks：变细、变粗按较粗那一块各记一次，进出视野不算', () => {
    const coarse: SectionId = { L: 2, i: -1, j: 3 };
    const children: SectionId[] = [
      { L: 1, i: -2, j: 6 },
      { L: 1, i: -1, j: 6 },
      { L: 1, i: -2, j: 7 },
      { L: 0, i: -2, j: 14 },
      { L: 0, i: -1, j: 14 },
    ];
    const other: SectionId = { L: 2, i: 5, j: 5 };
    expect(diffPicks([coarse, other], [...children, other])).toEqual([{ coarse, kind: 'refine' }]);
    expect(diffPicks([...children], [coarse, other])).toEqual([{ coarse, kind: 'coarsen' }]);
    expect(diffPicks([other], [other, coarse])).toEqual([]);
  });
});
