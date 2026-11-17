// 导入区段：区段工人和主线程跑同一份 importedSectionVoxels，工人拿到的是结构化克隆过的来源（RegExp、Uint8Array 的罩）和另一份区段数据（解码出来的，这里克隆一份代替），
// 结果要逐字节一样；主线程没拿到工人换好的体素块时从留着的区段数据重换，所以区段数据不能被改。
// 用几种方块的小表（buildBlockTable）：体素值 石头 1、草方块 2、泥土 3；只有草方块染色，草色把游戏坐标编进颜色（x 低 8 位、z 低 8 位、0x40），看得出按哪一格染的。
import { describe, expect, it } from 'vitest';
import type { BiomeColors } from './群系色.ts';
import { buildBlockTable, type BlockTableData } from './真实方块表.ts';
import { importedSectionVoxels as importWithTable, globRegex, type SectionContext } from './导入区段.ts';
import { buildPackTables as packTablesWithTable, noBiome, paddedSectionCols, type SectionData } from './区段包.ts';

const solidBlock = 4 + 8 + 16; // 标志：实心 + 满 + 遮 + 光（见 真实方块表.ts）
const smallTable: BlockTableData = {
  贴图: ['test:block/a'],
  面组: [[]],
  方块: { 'minecraft:stone': [solidBlock, null, 0], 'minecraft:grass_block': [solidBlock, 'grass', 0], 'minecraft:dirt': [solidBlock, null, 0] },
};
const positionGrass = (_b: string, x: number, z: number) => ((x & 255) << 16) | ((z & 255) << 8) | 0x40;
const testBiomes: BiomeColors = {
  biomeIds: ['minecraft:plains'],
  grassColor: positionGrass,
  foliageColor: () => 0xffffff,
  waterColor: () => 0xffffff,
  biomeColors: () => ({ grass: 0xc8c8c8, foliage: 0xc8c8c8, water: 0xc8c8c8 }),
  variesByPos: () => true,
};
const table = buildBlockTable(smallTable, testBiomes);
const importedSectionVoxels = (data: SectionData, ctx: SectionContext) => importWithTable(data, ctx, table);
const buildPackTables = (info: Parameters<typeof packTablesWithTable>[0]) => packTablesWithTable(info, table);

// 每列从上往下：1 格空气、1 格草方块、2 格石头（nz 4）
const section = (): SectionData => {
  const cols = paddedSectionCols * paddedSectionCols;
  return {
    L: 0,
    i: 0,
    j: 0,
    kBottom: 0,
    nz: 4,
    palette: Uint16Array.from([0, noBiome, 1, 0, 2, 0]),
    runCounts: new Uint16Array(cols).fill(3),
    paletteIndex: Uint16Array.from({ length: cols * 3 }, (_, r) => [0, 2, 1][r % 3]!),
    runLengths: Uint16Array.from({ length: cols * 3 }, (_, r) => [1, 1, 2][r % 3]!),
  };
};
const info = { origin: [0, 64, 0] as [number, number, number], state: ['minecraft:air', 'minecraft:stone', 'minecraft:grass_block'], biome: ['minecraft:plains'] };
const cutBoxes = [
  { boxes: [0, 0, 0, 2, 2, 10], 留: null }, // 列 (1..2, 1..2) 整列挖空
  { boxes: [4, 4, 0, 5, 5, 10], 留: globRegex(['grass_*']) }, // 列 (5, 5) 只留草方块
];
// 游戏方块列 (9, −10) 是体素列 (10, 10)；地面顶面场景 z 7，竖直范围要往上扩
const flattenAreas = [{ x0: 9, z0: -10, nx: 1, nz: 1, mask: Uint8Array.of(1), groundY: 70, fillBlocks: ['minecraft:dirt'] }];
const context = (src: { info: typeof info; cutBoxes: typeof cutBoxes; flattenAreas: typeof flattenAreas }): SectionContext => ({
  info: src.info,
  tables: buildPackTables(src.info),
  variesByPos: src.info.biome.map(() => true),
  cutBoxes: src.cutBoxes,
  flattenAreas: src.flattenAreas,
});
const cols = paddedSectionCols;
const at = (a: number, b: number, k: number) => (k * cols + b) * cols + a;

describe('导入区段', () => {
  it('挖、留、整平、按位置染色', () => {
    const v = importedSectionVoxels(section(), context({ info, cutBoxes, flattenAreas }));
    expect(v.nz).toBe(8); // 整平把竖直范围扩到地面顶上一格
    expect(v.origin).toEqual([0, 0, 0]);
    for (let k = 0; k < v.nz; k++) expect(v.vox[at(1, 1, k)]).toBe(0);
    expect(v.carveMask?.[1 * cols + 1]).toBe(1);
    expect(v.carveMask?.[5 * cols + 5]).toBe(0);
    // 只留草方块：石头挖掉，草方块还在（按位置重算过颜色）
    expect(v.vox[at(5, 5, 0)]).toBe(0);
    expect(v.palette[v.vox[at(5, 5, 2)]!]!.v).toBe(2);
    // 整平：k < 7 全是泥土，以上是空气
    const dirt = v.vox[at(10, 10, 0)]!;
    expect(v.palette[dirt]!.v).toBe(3);
    for (let k = 0; k < 7; k++) expect(v.vox[at(10, 10, k)]).toBe(dirt);
    expect(v.vox[at(10, 10, 7)]).toBe(0);
    // 草方块按格子最小角的游戏坐标染色：体素列 (3, 3) 是游戏 x 2、z −3
    const grass = v.palette[v.vox[at(3, 3, 2)]!]!;
    expect(grass).toEqual({ v: 2, c: [2, 253, 0x40] });
  });

  it('地面低于存的范围：往下扩，扩出来的填石头', () => {
    const low = [{ ...flattenAreas[0]!, groundY: 61 }]; // 地面顶面场景 z −2
    const v = importedSectionVoxels(section(), context({ info, cutBoxes: [], flattenAreas: low }));
    expect(v.origin[2]).toBe(-3);
    expect(v.palette[v.vox[at(0, 0, 0)]!]!.v).toBe(1);
    expect(v.carveMask).toBeUndefined();
  });

  it('工人那边（来源、区段都是另一份）和主线程逐字节一样，区段数据不被改', () => {
    const data = section();
    const before = structuredClone(data);
    const main = importedSectionVoxels(data, context({ info, cutBoxes, flattenAreas }));
    const worker = importedSectionVoxels(structuredClone(data), context(structuredClone({ info, cutBoxes, flattenAreas })));
    expect(worker.vox).toEqual(main.vox);
    expect(worker.carveMask).toEqual(main.carveMask);
    expect(worker.palette).toEqual(main.palette);
    expect([worker.nx, worker.ny, worker.nz, worker.cell, worker.origin]).toEqual([main.nx, main.ny, main.nz, main.cell, main.origin]);
    expect(data).toEqual(before);
    // 同一份数据重换一次（工人换好的已经交出去、网格又被挤掉）结果一样
    expect(importedSectionVoxels(data, context({ info, cutBoxes, flattenAreas })).vox).toEqual(main.vox);
  });
});
