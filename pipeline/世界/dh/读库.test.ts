// DH 的 LOD 库读取（读库.ts）：各行叠成列、四条边取 AdjData、不知道地表的列不要、地表往下只留 depth 格、内圈雪层的高段只留最上一格。库是 测试夹具.ts 照同一份格式说明造的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeDhDb, type DhTestColumn } from './测试夹具.ts';
import { dhRowSpan, dhStateString, openDhDb, type DhColumns } from './读库.ts';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '世界-dh-'));
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

const P = 'minecraft:plains_DH-BSW_';
const air = `${P}AIR`, stone = `${P}minecraft:stone`, grass = `${P}minecraft:grass_block_STATE_{snowy:false}`, snow = `minecraft:frozen_peaks_DH-BSW_minecraft:snow_block`;
const snowLayer = `${P}minecraft:snow_STATE_{layers:1}`, fence = `${P}minecraft:oak_fence`;
// 地表高度：y = 70 + (x + 2z) % 5；最上面一格草，下面石头
const surfaceY = (x: number, z: number) => 70 + ((x + 2 * z) % 5);
const groundRow = (x: number, z: number, y0: number, span: number): DhTestColumn => {
  const top = surfaceY(x, z);
  if (top < y0) return [[air, span]];
  if (top >= y0 + span) return [[stone, span]];
  const column: DhTestColumn = [];
  if (top < y0 + span - 1) column.push([air, y0 + span - 1 - top]);
  column.push([grass, 1]);
  if (top > y0) column.push([stone, top - y0]);
  return column;
};
const file = path.join(tempDir, 'DistantHorizons.sqlite');
makeDhDb(file, [
  // 区段 (0, 0)：y 64～127 是地面那一行，下面 0～63 一行石头，上面 128～191 一行空气；四条边在 AdjData 里换成雪
  { level: 0, posX: 0, posY: 2, posZ: 0, column: (_x, _z, _y0, span) => [[air, span]] },
  { level: 0, posX: 0, posY: 1, posZ: 0, column: (x, z, y0, span) => (x === 0 || z === 0 || x === 63 || z === 63 ? [[air, 20], [snow, span - 20]] : groundRow(x, z, y0, span)) },
  { level: 0, posX: 0, posY: 0, posZ: 0, column: (_x, _z, _y0, span) => [[stone, span]] },
  // 区段 (1, 0)：只存了地面那一行，x < 32 的列石头顶到行顶（上面那行没存，不知道地表），别的列行里有空气
  { level: 0, posX: 1, posY: 1, posZ: 0, column: (x, z, y0, span) => (x < 32 ? [[stone, span]] : groundRow(x, z, y0, span)) },
  // 区段 (2, 0)：整行石头，上面没存：一列都不要
  { level: 0, posX: 2, posY: 1, posZ: 0, column: (_x, _z, _y0, span) => [[stone, span]] },
  // 区段 (3, 0)：地面那行存了，再往下隔了一行没存（y 0～63），最底下 −64～−1 存着泥土
  { level: 0, posX: 3, posY: 1, posZ: 0, column: groundRow },
  { level: 0, posX: 3, posY: -1, posZ: 0, column: (_x, _z, _y0, span) => [[`${P}minecraft:dirt`, span]] },
  // 区段 (4, 0)：内圈是 DH 并过的样子，雪层从 y 93 一直连到 59（跨两行）；(5, 5) 那一列是三格栅栏；四条边没并，雪层 1 格、下面草方块
  {
    level: 0, posX: 4, posY: 1, posZ: 0,
    column: (x, z) => (x === 0 || z === 0 || x === 63 || z === 63 ? [[air, 34], [snowLayer, 1], [grass, 1], [stone, 28]] : x === 5 && z === 5 ? [[air, 34], [fence, 3], [stone, 27]] : [[air, 34], [snowLayer, 30]]),
  },
  { level: 0, posX: 4, posY: 0, posZ: 0, column: (x, z, _y0, span) => (x === 0 || z === 0 || x === 63 || z === 63 || (x === 5 && z === 5) ? [[stone, span]] : [[snowLayer, 5], [stone, span - 5]]) },
  // 第 1 级（一行 128 格，y 0～127）：内圈雪层连着 20 格，四条边 1 格
  { level: 1, posX: 7, posY: 0, posZ: 7, column: (x, z) => (x === 0 || z === 0 || x === 63 || z === 63 ? [[air, 100], [snowLayer, 1], [grass, 1], [stone, 26]] : [[air, 100], [snowLayer, 20], [stone, 8]]) },
  // 第 3 级：一行管 512 格（y 0～511）
  { level: 3, posX: -1, posY: 0, posZ: 5, column: (x, _z, _y0, span) => [[air, span - 100 - x], [grass, 1], [stone, 99 + x]] },
]);
const db = openDhDb(file);
afterAll(() => db.close());
const options = { yFloor: -64, worldTop: 191, depth: 1000 };
/** 一列的段：[状态串, 群系, 段底 y] */
const runs = (columns: DhColumns, x: number, z: number) => {
  const c = x * 64 + z;
  return Array.from({ length: columns.start[c + 1]! - columns.start[c]! }, (_, k) => {
    const r = columns.start[c]! + k;
    return [db.states[columns.state[r]!], columns.state[r] ? db.biomes[columns.biome[r]!] : null, columns.bottom[r]];
  });
};

describe('DH 的 LOD 库', () => {
  it('行高、映射串', () => {
    expect([0, 3, 5, 6, 8].map(dhRowSpan)).toEqual([64, 512, 2048, 2048, 2048]);
    expect(dhStateString('AIR')).toBe('minecraft:air');
    expect(dhStateString('minecraft:stone')).toBe('minecraft:stone');
    expect(dhStateString('minecraft:oak_log_STATE_{axis:y}')).toBe('minecraft:oak_log[axis=y]');
    expect(dhStateString('minecraft:grass_block_STATE_{snowy:false}')).toBe('minecraft:grass_block[snowy=false]');
  });

  it('有哪些区段', () => {
    expect(db.sections(0).sort((a, b) => a[0] - b[0])).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
    expect(db.sections(3)).toEqual([[-1, 5]]);
    expect(db.has(0, 1, 0)).toBe(true);
    expect(db.has(1, 0, 0)).toBe(false);
    expect(db.read(1, 0, 0, options)).toBeNull();
  });

  it('三行叠成列：上面空气、地表、下面并到底；内圈按 (x, z) 排', () => {
    const columns = db.read(0, 0, 0, options)!;
    for (const [x, z] of [[1, 1], [5, 9], [62, 62], [30, 1], [1, 30]] as const) {
      const top = surfaceY(x, z);
      expect(columns.top[x * 64 + z]).toBe(top);
      expect(runs(columns, x, z)).toEqual([['minecraft:air', null, top + 1], ['minecraft:grass_block[snowy=false]', 'minecraft:plains', top], ['minecraft:stone', 'minecraft:plains', -64]]);
    }
  });

  it('四条边取 AdjData', () => {
    const columns = db.read(0, 0, 0, options)!;
    for (const [x, z] of [[0, 0], [0, 17], [63, 40], [63, 63], [9, 0], [33, 63], [0, 63], [63, 0]] as const) {
      expect(columns.top[x * 64 + z]).toBe(107);
      expect(runs(columns, x, z)).toEqual([['minecraft:air', null, 108], ['minecraft:snow_block', 'minecraft:frozen_peaks', 64], ['minecraft:stone', 'minecraft:plains', -64]]);
    }
  });

  it('上面那行没存：行里有空气的列算数，石头顶到行顶的列不要', () => {
    const columns = db.read(0, 1, 0, options)!;
    expect(runs(columns, 5, 5)).toEqual([]);
    expect(columns.top[5 * 64 + 5]).toBe(-(2 ** 31));
    const top = surfaceY(40, 7);
    // 下面那行没存，补石头到底（群系号 0）
    expect(runs(columns, 40, 7)).toEqual([['minecraft:air', null, top + 1], ['minecraft:grass_block[snowy=false]', 'minecraft:plains', top], ['minecraft:stone', 'minecraft:plains', -64]]);
    expect(db.read(0, 2, 0, options)).toBeNull();
  });

  it('中间缺一行补石头，再往下接着读', () => {
    const columns = db.read(0, 3, 0, options)!;
    const top = surfaceY(8, 8);
    expect(runs(columns, 8, 8)).toEqual([['minecraft:air', null, top + 1], ['minecraft:grass_block[snowy=false]', 'minecraft:plains', top], ['minecraft:stone', 'minecraft:plains', 0], ['minecraft:dirt', 'minecraft:plains', -64]]);
  });

  it('只留地表往下 depth 格，再往下是石头一直到底；高度范围外的不读', () => {
    const top = surfaceY(8, 8);
    // 深度截在泥土那一行里（y −6）：泥土只留到那里
    const mid = db.read(0, 3, 0, { yFloor: -64, worldTop: 191, depth: top + 6 })!;
    expect(runs(mid, 8, 8)).toEqual([['minecraft:air', null, top + 1], ['minecraft:grass_block[snowy=false]', 'minecraft:plains', top], ['minecraft:stone', 'minecraft:plains', 0], ['minecraft:dirt', 'minecraft:plains', -6], ['minecraft:stone', 'minecraft:plains', -64]]);
    // 截在没存的那一行上面：泥土整段不要
    const shallow = db.read(0, 3, 0, { yFloor: -64, worldTop: 191, depth: 3 })!;
    expect(runs(shallow, 8, 8)).toEqual([['minecraft:air', null, top + 1], ['minecraft:grass_block[snowy=false]', 'minecraft:plains', top], ['minecraft:stone', 'minecraft:plains', -64]]);
    const cut = db.read(0, 0, 0, { yFloor: 64, worldTop: 127, depth: 1000 })!;
    expect(runs(cut, 5, 9)).toEqual([['minecraft:air', null, surfaceY(5, 9) + 1], ['minecraft:grass_block[snowy=false]', 'minecraft:plains', surfaceY(5, 9)], ['minecraft:stone', 'minecraft:plains', 64]]);
  });

  it('内圈雪层的高段：最上一格是雪层，下面换雪块（跨行也算同一段）；四条边、栅栏照原样', () => {
    const columns = db.read(0, 4, 0, options)!;
    for (const [x, z] of [[1, 1], [30, 40], [62, 62]] as const) {
      expect(columns.top[x * 64 + z]).toBe(93);
      expect(runs(columns, x, z)).toEqual([['minecraft:air', null, 94], ['minecraft:snow[layers=1]', 'minecraft:plains', 93], ['minecraft:snow_block', 'minecraft:plains', 59], ['minecraft:stone', 'minecraft:plains', -64]]);
    }
    for (const [x, z] of [[0, 9], [63, 63], [20, 0]] as const)
      expect(runs(columns, x, z)).toEqual([['minecraft:air', null, 94], ['minecraft:snow[layers=1]', 'minecraft:plains', 93], ['minecraft:grass_block[snowy=false]', 'minecraft:plains', 92], ['minecraft:stone', 'minecraft:plains', -64]]);
    expect(runs(columns, 5, 5)).toEqual([['minecraft:air', null, 94], ['minecraft:oak_fence', 'minecraft:plains', 91], ['minecraft:stone', 'minecraft:plains', -64]]);
    // 深度正好截在雪层那一段里：截掉的下面是石头，不是把雪层拉到底
    const shallow = db.read(0, 4, 0, { yFloor: -64, worldTop: 191, depth: 10 })!;
    expect(runs(shallow, 30, 40)).toEqual([['minecraft:air', null, 94], ['minecraft:snow[layers=1]', 'minecraft:plains', 93], ['minecraft:snow_block', 'minecraft:plains', 83], ['minecraft:stone', 'minecraft:plains', -64]]);
  });

  it('第 1 级起雪层整段换雪块，四条边也换', () => {
    const columns = db.read(1, 7, 7, { yFloor: 0, worldTop: 127, depth: 1000 })!;
    expect(runs(columns, 9, 9)).toEqual([['minecraft:air', null, 28], ['minecraft:snow_block', 'minecraft:plains', 8], ['minecraft:stone', 'minecraft:plains', 0]]);
    expect(runs(columns, 0, 9)).toEqual([['minecraft:air', null, 28], ['minecraft:snow_block', 'minecraft:plains', 27], ['minecraft:grass_block[snowy=false]', 'minecraft:plains', 26], ['minecraft:stone', 'minecraft:plains', 0]]);
  });

  it('粗的级一行管得高', () => {
    const columns = db.read(3, -1, 5, { yFloor: 0, worldTop: 511, depth: 1000 })!;
    expect(columns.top[10 * 64 + 3]).toBe(109);
    expect(runs(columns, 10, 3)).toEqual([['minecraft:air', null, 110], ['minecraft:grass_block[snowy=false]', 'minecraft:plains', 109], ['minecraft:stone', 'minecraft:plains', 0]]);
  });
});
