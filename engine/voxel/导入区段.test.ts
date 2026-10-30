// 导入区段：区段工人和主线程跑同一份 importedSectionVoxels，工人拿到的是结构化克隆过的来源（RegExp、Uint8Array 的罩）和重新解码的区段数据，
// 结果要逐字节一样；主线程没拿到工人换好的体素块时从留着的区段数据重换，所以区段数据不能被改。
// 真实方块表要 `asset:` 方块表，vitest 里解析不了，换成几种方块的小表。
import { describe, expect, it, vi } from 'vitest';

vi.mock('./真实方块表.ts', () => {
  const ids: Record<string, number> = { 'minecraft:air': 0, 'minecraft:stone': 1, 'minecraft:grass_block': 2, 'minecraft:dirt': 3 };
  return {
    voxelFromState: (s: string) => ids[s] ?? 0,
    blockProps: { tint: Uint8Array.from([0, 0, 1, 0]) }, // 只有草方块染色
    blockTint: (_v: number, _b: string, x: number, z: number) => ((x & 255) << 16) | ((z & 255) << 8) | 0x40,
    buildTintTable: () => ({ t: new Uint8Array(6 * 3).fill(200), C: 6 }),
    biomeIndex: () => 0,
  };
});

const { importedSectionVoxels, globRegex } = await import('./导入区段.ts');
const { buildPackTables, decodeSection, encodeSection, noBiome, paddedSectionCols } = await import('./区段包.ts');
type 区段上下文 = import('./导入区段.ts').区段上下文;
type SectionData = import('./区段包.ts').SectionData;

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
const info = { 原点: [0, 64, 0] as [number, number, number], 状态: ['minecraft:air', 'minecraft:stone', 'minecraft:grass_block'], 群系: ['minecraft:plains'] };
const cutBoxes = [
  { 盒: [0, 0, 0, 2, 2, 10], 留: null }, // 列 (1..2, 1..2) 整列挖空
  { 盒: [4, 4, 0, 5, 5, 10], 留: globRegex(['grass_*']) }, // 列 (5, 5) 只留草方块
];
// 游戏方块列 (9, −10) 是体素列 (10, 10)；地面顶面场景 z 7，竖直范围要往上扩
const flattenAreas = [{ x0: 9, z0: -10, nx: 1, nz: 1, 罩: Uint8Array.of(1), 地面y: 70, fillBlocks: ['minecraft:dirt'] }];
const context = (src: { info: typeof info; cutBoxes: typeof cutBoxes; flattenAreas: typeof flattenAreas }): 区段上下文 => ({
  info: src.info,
  tables: buildPackTables(src.info),
  variesByPos: src.info.群系.map(() => true),
  cutBoxes: src.cutBoxes,
  flattenAreas: src.flattenAreas,
});
const cols = paddedSectionCols;
const at = (a: number, b: number, k: number) => (k * cols + b) * cols + a;

describe('导入区段', () => {
  it('挖、留、整平、按位置染色', () => {
    const v = importedSectionVoxels(section(), context({ info, cutBoxes, flattenAreas }));
    expect(v.nz).toBe(8); // 整平把竖直范围扩到地面顶上一格
    expect(v.原点).toEqual([0, 0, 0]);
    for (let k = 0; k < v.nz; k++) expect(v.vox[at(1, 1, k)]).toBe(0);
    expect(v.挖空?.[1 * cols + 1]).toBe(1);
    expect(v.挖空?.[5 * cols + 5]).toBe(0);
    // 只留草方块：石头挖掉，草方块还在（按位置重算过颜色）
    expect(v.vox[at(5, 5, 0)]).toBe(0);
    expect(v.色板[v.vox[at(5, 5, 2)]!]!.v).toBe(2);
    // 整平：k < 7 全是泥土，以上是空气
    const dirt = v.vox[at(10, 10, 0)]!;
    expect(v.色板[dirt]!.v).toBe(3);
    for (let k = 0; k < 7; k++) expect(v.vox[at(10, 10, k)]).toBe(dirt);
    expect(v.vox[at(10, 10, 7)]).toBe(0);
    // 草方块按格子最小角的游戏坐标染色：体素列 (3, 3) 是游戏 x 2、z −3
    const grass = v.色板[v.vox[at(3, 3, 2)]!]!;
    expect(grass).toEqual({ v: 2, c: [2, 253, 0x40] });
  });

  it('地面低于存的范围：往下扩，扩出来的填石头', () => {
    const low = [{ ...flattenAreas[0]!, 地面y: 61 }]; // 地面顶面场景 z −2
    const v = importedSectionVoxels(section(), context({ info, cutBoxes: [], flattenAreas: low }));
    expect(v.原点[2]).toBe(-3);
    expect(v.色板[v.vox[at(0, 0, 0)]!]!.v).toBe(1);
    expect(v.挖空).toBeUndefined();
  });

  it('工人那边（来源结构化克隆、区段重新解码）和主线程逐字节一样，区段数据不被改', () => {
    const data = section();
    const before = encodeSection(data);
    const main = importedSectionVoxels(data, context({ info, cutBoxes, flattenAreas }));
    const worker = importedSectionVoxels(decodeSection(encodeSection(data)), context(structuredClone({ info, cutBoxes, flattenAreas })));
    expect(worker.vox).toEqual(main.vox);
    expect(worker.挖空).toEqual(main.挖空);
    expect(worker.色板).toEqual(main.色板);
    expect([worker.nx, worker.ny, worker.nz, worker.格, worker.原点]).toEqual([main.nx, main.ny, main.nz, main.格, main.原点]);
    expect(encodeSection(data)).toEqual(before);
    // 同一份数据重换一次（工人换好的已经交出去、网格又被挤掉）结果一样
    expect(importedSectionVoxels(data, context({ info, cutBoxes, flattenAreas })).vox).toEqual(main.vox);
  });
});
