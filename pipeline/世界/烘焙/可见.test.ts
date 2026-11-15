// 可见变换的小例子（不读包）：用户 11-14 点名要防的误伤各造一个最小的。整包的格、网格核对在转码时跑（可见核对.ts），端到端在 烘焙.test.ts。
import { describe, expect, it } from 'vitest';
import { replaceBuriedWithStone, fillSealedCavity, normalizeNeighborRing, replaceCoreEdgeWithStone, applySafety, makeSection, toGrid, windowEdge as edge, type CellGrid } from './可见.ts';
import { toColumnMajor } from './区段编码.ts';
import { countUnsealed } from './可见核对.ts';

const colCount = edge * edge, nz = 40, topHeight = 30; // 实心到 k = 29，上面是空气
const air = 0, stone = 1, dirt = 2, water = 3;
const makeGrid = (): CellGrid => {
  const cm = new Uint16Array(colCount * nz);
  for (let c = 0; c < colCount; c++) cm.fill(dirt, c * nz, c * nz + topHeight);
  return { id: { L: 0, i: 0, j: 0 }, kBottom: 0, nz, cm, palette: [0, 65535, 1, 65535, 2, 65535, 3, 65535], fullMask: Uint8Array.of(0, 1, 1, 0), stone };
};
const at = (x: number, y: number, k: number) => (y * edge + x) * nz + k;
const digBox = (g: CellGrid, x0: number, y0: number, k0: number, x1: number, y1: number, k1: number, v = air) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let k = k0; k <= k1; k++) g.cm[at(x, y, k)] = v; };
const carveHole = (g: CellGrid, v = air) => digBox(g, 15, 15, 10, 17, 17, 12, v); // 3×3×3 的腔，顶上还有 17 格土

describe('封腔填实', () => {
  it('封死的腔填，水腔一样；填的格经 封闭 复核', () => {
    const g = makeGrid(); carveHole(g);
    const original = { ...g, cm: g.cm.slice() }, filled = fillSealedCavity(g);
    expect(filled.length).toBe(27);
    expect(countUnsealed(original, filled)).toBe(0);
    const w = makeGrid(); carveHole(w, water);
    expect(fillSealedCavity(w).length).toBe(27);
  });
  it('腔经一条 1 格的洞横着再拐上去通到地面：不填', () => {
    const g = makeGrid(); carveHole(g); digBox(g, 18, 16, 11, 25, 16, 11); digBox(g, 25, 16, 12, 25, 16, topHeight - 1);
    expect(fillSealedCavity(g).length).toBe(0);
  });
  it('崖下的凹洞，口只有 1 格高：不填；洞壁和崖壁不换', () => {
    const g = makeGrid(); carveHole(g); digBox(g, 20, 0, 12, edge - 1, edge - 1, topHeight - 1); digBox(g, 18, 16, 12, 19, 16, 12);
    expect(fillSealedCavity(g).length).toBe(0);
    replaceBuriedWithStone(g);
    for (const [x, y, k] of [[14, 16, 11], [16, 16, 9], [16, 16, 13], [19, 10, 20], [19, 16, 13], [22, 10, 11]]) expect(g.cm[at(x!, y!, k!)], `贴着露天的 ${x},${y},${k}`).toBe(dirt);
    expect(g.cm[at(10, 10, 5)]).toBe(stone); // 四面都埋着的照换
  });
  it('只经 1 格的洞横着通到核心的边（第 1 列）：窗口外不知道，当连通不填；差一格没到边就填', () => {
    const g = makeGrid(); carveHole(g); digBox(g, 1, 16, 11, 14, 16, 11);
    expect(fillSealedCavity(g).length).toBe(0);
    const h = makeGrid(); carveHole(h); digBox(h, 2, 16, 11, 14, 16, 11);
    expect(fillSealedCavity(h).length).toBe(27 + 13);
  });
  it('水连着水也算连通：腔里的水经水道通到地面的湖，不填', () => {
    const g = makeGrid(); carveHole(g, water); digBox(g, 16, 16, 13, 16, 16, topHeight - 1, water);
    expect(fillSealedCavity(g).length).toBe(0);
  });
});

describe('埋格换石', () => {
  it('不动核心的边和邻圈、最上一层、贴着腔的格，换完不透明性不变', () => {
    const g = makeGrid(); carveHole(g);
    const before = g.cm.slice();
    expect(replaceBuriedWithStone(g)).toBeGreaterThan(0);
    for (let i = 0; i < g.cm.length; i++) {
      const c = Math.floor(i / nz), k = i % nz, x = c % edge, y = (c - x) / edge;
      expect(g.fullMask[g.cm[i]!]).toBe(g.fullMask[before[i]!]);
      if (x < 2 || y < 2 || x > edge - 3 || y > edge - 3 || k >= topHeight - 1) expect(g.cm[i]).toBe(before[i]);
    }
    for (const [x, y, k] of [[14, 15, 10], [18, 17, 12], [16, 16, 13], [16, 16, 9]]) expect(g.cm[at(x!, y!, k!)]).toBe(dirt);
    expect(g.cm[at(14, 14, 9)]).toBe(stone); // 只沿棱、角挨着腔的不算贴着
  });
});

describe('邻圈、核心边', () => {
  it('邻圈：被埋的整格换，露在地表的那层不换；不挡面的归空，水不动；核心一格不动', () => {
    const g = makeGrid(); digBox(g, 0, 5, topHeight, 0, 5, topHeight, water); digBox(g, 0, 6, topHeight, 0, 6, topHeight, 4);
    g.palette.push(4, 65535); g.fullMask = Uint8Array.of(0, 1, 1, 0, 0);
    const before = g.cm.slice();
    normalizeNeighborRing(g, Uint8Array.of(0, 0, 0, 0, 1));
    expect(g.cm[at(0, 9, topHeight - 1)]).toBe(dirt);
    expect(g.cm[at(0, 9, topHeight - 2)]).toBe(stone);
    expect(g.cm[at(0, 5, topHeight)]).toBe(water);
    expect(g.cm[at(0, 6, topHeight)]).toBe(air);
    for (let i = 0; i < g.cm.length; i++) { const c = Math.floor(i / nz), x = c % edge, y = (c - x) / edge; if (x > 0 && y > 0 && x < edge - 1 && y < edge - 1) expect(g.cm[i]).toBe(before[i]); }
  });
  it('核心边：被埋的换；最上一层、贴着露天邻圈格的不换；没有邻段的一侧、粗格挡不住的不换', () => {
    const g = makeGrid(); digBox(g, 0, 10, 20, 0, 10, topHeight - 1); // 邻圈上一道缝，露出核心边 (1, 10) 的侧面
    const changed = replaceCoreEdgeWithStone(g, [true, true, true, false], (_x, y, _k, side) => !(side === 1 && y === 25));
    expect(changed.length).toBeGreaterThan(0);
    expect(g.cm[at(1, 20, 5)]).toBe(stone);
    expect(g.cm[at(1, 20, topHeight - 1)]).toBe(dirt);
    expect(g.cm[at(1, 10, 25)]).toBe(dirt);
    expect(g.cm[at(1, 10, 19)]).toBe(stone);
    expect(g.cm[at(1, 25, 5)]).toBe(dirt); // 粗格挡不住
    expect(g.cm[at(20, 1, 5)]).toBe(dirt); // −y 一侧在包的边上
    expect(g.cm[at(1, 1, 5)]).toBe(dirt); // 角上的格两侧都要有邻段
    expect(g.cm[at(5, 5, 5)]).toBe(dirt); // 核心里面的不归它管
  });
  it('粗级不动核心边', () => {
    const g = { ...makeGrid(), id: { L: 1, i: 0, j: 0 } };
    const { changeRecord } = applySafety(g, Uint8Array.of(0, 1, 1, 4), [true, true, true, true]);
    expect(changeRecord.核心边.length).toBe(0);
  });
});

describe('格子 ↔ 区段', () => {
  it('没改的格子原样回来；改了的色板按出现先后重排、丢掉没用的', () => {
    const g = makeGrid(); carveHole(g);
    const d = makeSection(g);
    expect(d.palette[0]).toBe(0);
    const back = toGrid(d, Uint8Array.of(0, 1, 1, 0), 1);
    expect(toColumnMajor(makeSection(back))).toEqual(toColumnMajor(d));
    expect(makeSection(back).palette).toEqual(d.palette);
    const { g: changedGrid } = applySafety(back, Uint8Array.of(0, 1, 1, 4), [true, true, true, true]);
    const d2 = makeSection(changedGrid);
    // 土在最上面先出现，石头（填充）在后
    expect(Array.from(d2.palette)).toEqual([0, 65535, 2, 65535, 1, 65535]);
  });
});
