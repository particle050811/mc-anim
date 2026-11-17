// 网格（网格.ts 的 buildSectionMesh）金样测试：面剔除、贪心合并、按朝向分组、按材质分。
// 不用数据根里的真方块表：按一张几种方块的小表（格式同 关键帧方块.py 导出的）建网格函数（sectionMesher），合并结果不随真实方块表变。一个小区段的网格存在 金样/网格.json。
import { describe, expect, it } from 'vitest';
import { buildBiomeColors } from './群系色.ts';
import { buildBlockTable, type BlockTableData } from './真实方块表.ts';
import { crossGroup, groupCount, sectionMesher, twoSidedGroup } from './网格.ts';
import type { VoxelGrid } from './生成.ts';

const testTable = (() => {
  // 一个整格方块的六个面：[朝向, 剔除方向, 贴图, 叠加, 染, 明暗, 四个角 xyz（1/16 格，从外面看 左上 右上 右下 左下）, 四个角 uv]
  const faceCorners: Record<string, number[][]> = {
    '+x': [[16, 0, 16], [16, 16, 16], [16, 16, 0], [16, 0, 0]],
    '-x': [[0, 16, 16], [0, 0, 16], [0, 0, 0], [0, 16, 0]],
    '+y': [[16, 16, 16], [0, 16, 16], [0, 16, 0], [16, 16, 0]],
    '-y': [[0, 0, 16], [16, 0, 16], [16, 0, 0], [0, 0, 0]],
    '+z': [[0, 16, 16], [16, 16, 16], [16, 0, 16], [0, 0, 16]],
    '-z': [[16, 16, 0], [0, 16, 0], [0, 0, 0], [16, 0, 0]],
  };
  const blockFaceGroup = (textureIndex: number, tint = 0) => Object.entries(faceCorners).map(([d, c]) => [d, d, textureIndex, -1, tint, 1, ...c.flat(), 0, 0, 16, 0, 16, 16, 0, 16]);
  // 半砖：z 压到 [z0, z1]（1/16 格）；顶面贴着格子顶才按上面剔
  const slabFaceGroup = (textureIndex: number, z0: number, z1: number) =>
    Object.entries(faceCorners).map(([d, c]) => [d, d === '+z' && z1 < 16 ? '' : d === '-z' && z0 > 0 ? '' : d, textureIndex, -1, 0, 1, ...c.flatMap(([x, y, z]) => [x, y, z === 16 ? z1 : z0]), 0, 0, 16, 0, 16, 16, 0, 16]);
  // 顶面贴图转 90° 的整格方块（横放原木 axis=x 和 axis=z 的顶面就差这一下）
  const turnedTopFaceGroup = (textureIndex: number) => blockFaceGroup(textureIndex).map((f) => (f[0] === '+z' ? [...f.slice(0, 18), 16, 0, 16, 16, 0, 16, 0, 0] : f));
  // 花草（照 jar 导出的原样）：草的十字面两片 × 正反（背面 u 镜像）；海草沿轴的两片 × 正反（原版是四片，取两片）；向日葵那样正反两张贴图不同的一片
  const quadUv = [0, 0, 16, 0, 16, 16, 0, 16];
  const crossFaceGroup = (textureIndex: number) => [
    [[15.2, 15.2, 16], [0.8, 0.8, 16], [0.8, 0.8, 0], [15.2, 15.2, 0]],
    [[0.8, 0.8, 16], [15.2, 15.2, 16], [15.2, 15.2, 0], [0.8, 0.8, 0]],
    [[0.8, 15.2, 16], [15.2, 0.8, 16], [15.2, 0.8, 0], [0.8, 15.2, 0]],
    [[15.2, 0.8, 16], [0.8, 15.2, 16], [0.8, 15.2, 0], [15.2, 0.8, 0]],
  ].map((c) => ['', '', textureIndex, -1, 1, 0, ...c.flat(), ...quadUv]);
  const seagrassFaceGroup = (textureIndex: number) => [
    ['+y', [[16, 12, 16], [0, 12, 16], [0, 12, 0], [16, 12, 0]]],
    ['-y', [[0, 12, 16], [16, 12, 16], [16, 12, 0], [0, 12, 0]]],
    ['-x', [[12, 16, 16], [12, 0, 16], [12, 0, 0], [12, 16, 0]]],
    ['+x', [[12, 0, 16], [12, 16, 16], [12, 16, 0], [12, 0, 0]]],
  ].map(([d, c]) => [d, '', textureIndex, -1, 0, 0, ...(c as number[][]).flat(), ...quadUv]);
  const twoTextureFaceGroup = (a: number, b: number) => [
    ['', '', a, -1, 0, 0, 15.2, 15.2, 16, 0.8, 0.8, 16, 0.8, 0.8, 0, 15.2, 15.2, 0, ...quadUv],
    ['', '', b, -1, 0, 0, 0.8, 0.8, 16, 15.2, 15.2, 16, 15.2, 15.2, 0, 0.8, 0.8, 0, ...quadUv],
  ];
  return {
    blockTable: {
      贴图: ['test:block/stone', 'test:block/dirt', 'test:block/grass', 'test:block/leaves', 'test:block/water', 'test:block/short_grass', 'test:block/seagrass', 'test:block/sun_front', 'test:block/sun_back'],
      面组: [blockFaceGroup(0), blockFaceGroup(1), blockFaceGroup(2, 1), blockFaceGroup(3, 1), blockFaceGroup(4, 1), slabFaceGroup(0, 0, 8), slabFaceGroup(0, 8, 16), turnedTopFaceGroup(1), crossFaceGroup(5), seagrassFaceGroup(6), twoTextureFaceGroup(7, 8)],
      // 标志：类（0 实心 1 镂空 3 液体）+ 4 满 + 8 遮 + 16 光
      方块: {
        'test:stone': [4 + 8 + 16, null, 0],
        'test:dirt': [4 + 8 + 16, null, 1],
        'test:grass_block': [4 + 8 + 16, 'grass', 2],
        'test:oak_leaves': [1 + 8 + 16, 'foliage', 3],
        'test:water': [3, 'water', 4],
        'test:slab[type=bottom]': [16, null, 5],
        'test:slab[type=top]': [16, null, 6],
        'test:dirt_turned': [4 + 8 + 16, null, 7],
        'test:short_grass': [1, 'grass', 8],
        'test:seagrass': [1, null, 9],
        'test:sunflower': [1, null, 10],
      },
    },
    biomeColor: { 群系: { 'minecraft:plains': { 草: '#91bd59', 叶: '#77ab2f', 水: '#3f76e4' } } },
  };
})();
const blockTable = buildBlockTable(testTable.blockTable as unknown as BlockTableData, buildBiomeColors(testTable.biomeColor));
const buildSectionMesh = sectionMesher(blockTable);
const { voxelFromState } = blockTable;

const [stone, dirt, grassBlock, leaf, water] = ['test:stone', 'test:dirt', 'test:grass_block', 'test:oak_leaves', 'test:water'].map((s) => voxelFromState(s));
/** 区段：核心 n×n、四周一圈 apron、nz 高；填 = (x, y, z) → 色板号（0 空气），x、y 是含 apron 的下标 */
const makeSectionGrid = (n: number, nz: number, valueAt: (x: number, y: number, z: number) => number): VoxelGrid => {
  const nx = n + 2;
  const vox = new Uint16Array(nx * nx * nz);
  for (let z = 0; z < nz; z++) for (let y = 0; y < nx; y++) for (let x = 0; x < nx; x++) vox[(z * nx + y) * nx + x] = valueAt(x, y, z);
  const palette = [
    { v: 0, c: [0, 0, 0] as [number, number, number] },
    { v: stone!, c: [255, 255, 255] as [number, number, number] },
    { v: dirt!, c: [255, 255, 255] as [number, number, number] },
    { v: grassBlock!, c: [145, 189, 89] as [number, number, number] },
    { v: leaf!, c: [119, 171, 47] as [number, number, number] },
    { v: water!, c: [63, 118, 228] as [number, number, number] },
  ];
  return { nx, ny: nx, nz, cell: 1, origin: [0, 0, 0], vox, palette };
};
/** 第 g 组（0～5：+x -x +y -y +z -z）有几个面 */
const groupFaceCount = (faceGroup: { segment: number[] }, g: number) => faceGroup.segment[g + 1]! - faceGroup.segment[g]!;

describe('区段网格', () => {
  it('一整层石头（apron 也是）：顶面并成一块，侧面贴着 apron 的进裙边（四组各并成一块）', () => {
    const m = buildSectionMesh(makeSectionGrid(8, 2, (_x, _y, z) => (z === 0 ? 1 : 0)), false);
    expect(groupFaceCount(m.实心, 4)).toBe(1);
    for (const g of [0, 1, 2, 3]) expect(groupFaceCount(m.实心, g)).toBe(0);
    for (const g of [8, 9, 10, 11]) expect(groupFaceCount(m.实心, g)).toBe(1);
    expect(m.实心.segment.length).toBe(groupCount + 1);
  });
  it('贴图、染色不同的面不合并；挨着的同种方块之间的面剔掉', () => {
    // 核心里一半石头一半泥土，上面一块草方块
    const m = buildSectionMesh(makeSectionGrid(4, 3, (x, y, z) => (z === 0 ? (x <= 2 ? 1 : 2) : z === 1 && x === 2 && y === 2 ? 3 : 0)), false);
    // 顶面：石头、泥土各并成一块（草方块压住的那格不画），草方块顶一块
    expect(groupFaceCount(m.实心, 4)).toBeGreaterThanOrEqual(3);
    // 草方块四个侧面露在外面
    for (const g of [0, 1, 2, 3]) expect(groupFaceCount(m.实心, g)).toBeGreaterThanOrEqual(1);
  });
  it('深度或贴图朝向不同的面不合并（下半砖挨上半砖、横放原木 x 挨 z）', () => {
    const topFaces = (a: string, b: string) => {
      const [va, vb] = [voxelFromState(a)!, voxelFromState(b)!];
      const grid = makeSectionGrid(4, 3, (x, y, z) => (z === 0 ? 1 : z === 1 && y === 1 && x === 1 ? 6 : z === 1 && y === 1 && x === 2 ? 7 : 0));
      grid.palette.push({ v: va, c: [255, 255, 255] }, { v: vb, c: [255, 255, 255] });
      const m = buildSectionMesh(grid, false);
      const out: { z: number; x0: number; x1: number; uv: number[] }[] = [];
      for (const g of [m.实心, m.花草])
        for (let f = g.segment[4]!; f < g.segment[5]!; f++) {
          const z = g.pos[f * 12 + 2]! / 64;
          if (z <= 1) continue;
          const xs = [0, 1, 2, 3].map((c) => g.pos[f * 12 + c * 3]! / 64);
          out.push({ z, x0: Math.min(...xs), x1: Math.max(...xs), uv: Array.from(g.uv.slice(f * 8, f * 8 + 8)) });
        }
      return out.sort((p, q) => p.x0 - q.x0);
    };
    const slabs = topFaces('test:slab[type=bottom]', 'test:slab[type=top]');
    expect(slabs.map((f) => [f.x0, f.x1, f.z])).toEqual([[0, 1, 1.5], [1, 2, 2]]);
    const logs = topFaces('test:dirt', 'test:dirt_turned');
    expect(logs.map((f) => [f.x0, f.x1])).toEqual([[0, 1], [1, 2]]);
    expect(logs[0]!.uv).not.toEqual(logs[1]!.uv);
    // 对照：同种方块照样并成一张
    expect(topFaces('test:dirt', 'test:dirt').map((f) => [f.x0, f.x1])).toEqual([[0, 2]]);
  });
  it('树叶第 0 级画进镂空（叶子之间的面也画），粗级画成实心树叶（叶子之间剔掉）', () => {
    const leafPile = makeSectionGrid(4, 3, (x, y, z) => (z >= 1 && x >= 2 && x <= 3 && y >= 2 && y <= 3 ? 4 : z === 0 ? 1 : 0));
    const fineMesh = buildSectionMesh(leafPile, false);
    const coarseMesh = buildSectionMesh(leafPile, true);
    expect(fineMesh.镂空.n).toBeGreaterThan(0);
    expect(coarseMesh.实心树叶.n).toBeGreaterThan(0);
    expect(coarseMesh.实心树叶.n).toBeLessThan(fineMesh.镂空.n);
  });
  it('花草正反成对的面只出一张、两面画，背面贴图镜像的记 S + 1；配不上的照旧两张单面', () => {
    const plantMesh = (state: string, cells: [number, number][]) => {
      const grid = makeSectionGrid(4, 2, (x, y, z) => (z === 0 ? 1 : cells.some(([cx, cy]) => cx === x && cy === y) ? 6 : 0));
      grid.palette.push({ v: voxelFromState(state)!, c: [145, 189, 89] });
      return buildSectionMesh(grid, false).花草;
    };
    const sides = (g: { tex: Uint16Array; segment: number[] }, group: number) => {
      const out: number[] = [];
      for (let f = g.segment[group]!; f < g.segment[group + 1]!; f++) for (let c = 0; c < 4; c++) out.push(g.tex[(f * 4 + c) * 4 + 3]!);
      return [...new Set(out)];
    };
    // 草：两片十字面，背面 u = 16 − u
    const grass = plantMesh('test:short_grass', [[1, 1]]);
    expect(grass.n).toBe(2);
    expect(groupFaceCount(grass, crossGroup)).toBe(2);
    expect(sides(grass, crossGroup)).toEqual([17]);
    // 海草：沿轴的面进「两面沿轴」组；沿 x 挨着的两格，朝 ±y 那片并成一张，朝 ±x 的各一张
    const seagrass = plantMesh('test:seagrass', [[1, 1], [2, 1]]);
    for (let g = 0; g < 6; g++) expect(groupFaceCount(seagrass, g)).toBe(0);
    expect(groupFaceCount(seagrass, twoSidedGroup)).toBe(1 + 2);
    expect(sides(seagrass, twoSidedGroup)).toEqual([17]);
    // 正反贴图不同：两张都出，单面
    const sunflower = plantMesh('test:sunflower', [[1, 1]]);
    expect(groupFaceCount(sunflower, crossGroup)).toBe(2);
    expect(sides(sunflower, crossGroup)).toEqual([0]);
  });
  it('一个小区段的网格（金样）', async () => {
    const valueAt = (x: number, y: number, z: number) => {
      if (z === 0) return (x + y) % 3 === 0 ? 2 : 1;
      if (z === 1) return x >= 3 && y <= 2 ? 5 : x === 1 && y === 4 ? 3 : 0;
      if (z === 2) return x === 1 && y === 4 ? 4 : 0;
      return 0;
    };
    const jsonLines: string[] = [];
    for (const coarse of [false, true]) {
      const m = buildSectionMesh(makeSectionGrid(5, 4, valueAt), coarse);
      for (const materialKind of ['实心', '镂空', '实心树叶', '水', '花草'] as const) {
        const faceGroup = m[materialKind];
        jsonLines.push(JSON.stringify({ coarse: coarse, material: materialKind, n: faceGroup.n, segment: faceGroup.segment, pos: Array.from(faceGroup.pos), uv: Array.from(faceGroup.uv), tex: Array.from(faceGroup.tex), col: Array.from(faceGroup.col) }));
      }
      jsonLines.push(JSON.stringify({ coarse: coarse, faceCount: m.faceCount }));
    }
    await expect(`[\n${jsonLines.join(',\n')}\n]\n`).toMatchFileSnapshot('./金样/网格.json');
  });
});
