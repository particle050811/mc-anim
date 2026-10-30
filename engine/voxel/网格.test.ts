// 网格（网格.ts 的 buildSectionMesh）金样测试：面剔除、贪心合并、按朝向分组、按材质分。
// 方块表是数据根里的资产（asset:数据/场景/关键帧/方块表），测试不靠它：这里换成一张几种整格方块的小表（格式同 关键帧方块.py 导出的），
// 合并结果不随真实方块表变。一个小区段的网格存在 金样/网格.json。
import { describe, expect, it, vi } from 'vitest';

const 表 = vi.hoisted(() => {
  // 一个整格方块的六个面：[朝向, 剔除方向, 贴图, 叠加, 染, 明暗, 四个角 xyz（1/16 格，从外面看 左上 右上 右下 左下）, 四个角 uv]
  const 角: Record<string, number[][]> = {
    '+x': [[16, 0, 16], [16, 16, 16], [16, 16, 0], [16, 0, 0]],
    '-x': [[0, 16, 16], [0, 0, 16], [0, 0, 0], [0, 16, 0]],
    '+y': [[16, 16, 16], [0, 16, 16], [0, 16, 0], [16, 16, 0]],
    '-y': [[0, 0, 16], [16, 0, 16], [16, 0, 0], [0, 0, 0]],
    '+z': [[0, 16, 16], [16, 16, 16], [16, 0, 16], [0, 0, 16]],
    '-z': [[16, 16, 0], [0, 16, 0], [0, 0, 0], [16, 0, 0]],
  };
  const 方块 = (贴图: number, 染 = 0) => Object.entries(角).map(([d, c]) => [d, d, 贴图, -1, 染, 1, ...c.flat(), 0, 0, 16, 0, 16, 16, 0, 16]);
  return {
    方块表: {
      贴图: ['test:block/stone', 'test:block/dirt', 'test:block/grass', 'test:block/leaves', 'test:block/water'],
      面组: [方块(0), 方块(1), 方块(2, 1), 方块(3, 1), 方块(4, 1)],
      // 标志：类（0 实心 1 镂空 3 液体）+ 4 满 + 8 遮 + 16 光
      方块: {
        'test:stone': [4 + 8 + 16, null, 0],
        'test:dirt': [4 + 8 + 16, null, 1],
        'test:grass_block': [4 + 8 + 16, 'grass', 2],
        'test:oak_leaves': [1 + 8 + 16, 'foliage', 3],
        'test:water': [3, 'water', 4],
      },
    },
    群系色: { 群系: { 'minecraft:plains': { 草: '#91bd59', 叶: '#77ab2f', 水: '#3f76e4' } } },
  };
});
vi.mock('asset:数据/场景/关键帧/方块表', () => ({ default: 表.方块表 }));
vi.mock('asset:数据/场景/关键帧/群系色', () => ({ default: 表.群系色 }));

const { buildSectionMesh, groupCount } = await import('./网格.ts');
const { voxelFromState } = await import('./真实方块表.ts');
type VoxelGrid = import('./生成.ts').VoxelGrid;

const [石, 土, 草, 叶, 水] = ['test:stone', 'test:dirt', 'test:grass_block', 'test:oak_leaves', 'test:water'].map((s) => voxelFromState(s));
/** 区段：核心 n×n、四周一圈 apron、nz 高；填 = (x, y, z) → 色板号（0 空气），x、y 是含 apron 的下标 */
const 区段 = (n: number, nz: number, 填: (x: number, y: number, z: number) => number): VoxelGrid => {
  const nx = n + 2;
  const vox = new Uint16Array(nx * nx * nz);
  for (let z = 0; z < nz; z++) for (let y = 0; y < nx; y++) for (let x = 0; x < nx; x++) vox[(z * nx + y) * nx + x] = 填(x, y, z);
  const 色板 = [
    { v: 0, c: [0, 0, 0] as [number, number, number] },
    { v: 石!, c: [255, 255, 255] as [number, number, number] },
    { v: 土!, c: [255, 255, 255] as [number, number, number] },
    { v: 草!, c: [145, 189, 89] as [number, number, number] },
    { v: 叶!, c: [119, 171, 47] as [number, number, number] },
    { v: 水!, c: [63, 118, 228] as [number, number, number] },
  ];
  return { nx, ny: nx, nz, 格: 1, 原点: [0, 0, 0], vox, 色板 };
};
/** 第 g 组（0～5：+x -x +y -y +z -z）有几个面 */
const 组面数 = (组: { 段: number[] }, g: number) => 组.段[g + 1]! - 组.段[g]!;

describe('区段网格', () => {
  it('一整层石头（apron 也是）：顶面并成一块，侧面贴着 apron 的进裙边（四组各并成一块）', () => {
    const m = buildSectionMesh(区段(8, 2, (_x, _y, z) => (z === 0 ? 1 : 0)), false);
    expect(组面数(m.实心, 4)).toBe(1);
    for (const g of [0, 1, 2, 3]) expect(组面数(m.实心, g)).toBe(0);
    for (const g of [7, 8, 9, 10]) expect(组面数(m.实心, g)).toBe(1);
    expect(m.实心.段.length).toBe(groupCount + 1);
  });
  it('贴图、染色不同的面不合并；挨着的同种方块之间的面剔掉', () => {
    // 核心里一半石头一半泥土，上面一块草方块
    const m = buildSectionMesh(区段(4, 3, (x, y, z) => (z === 0 ? (x <= 2 ? 1 : 2) : z === 1 && x === 2 && y === 2 ? 3 : 0)), false);
    // 顶面：石头、泥土各并成一块（草方块压住的那格不画），草方块顶一块
    expect(组面数(m.实心, 4)).toBeGreaterThanOrEqual(3);
    // 草方块四个侧面露在外面
    for (const g of [0, 1, 2, 3]) expect(组面数(m.实心, g)).toBeGreaterThanOrEqual(1);
  });
  it('树叶第 0 级画进镂空（叶子之间的面也画），粗级画成实心树叶（叶子之间剔掉）', () => {
    const 叶堆 = 区段(4, 3, (x, y, z) => (z >= 1 && x >= 2 && x <= 3 && y >= 2 && y <= 3 ? 4 : z === 0 ? 1 : 0));
    const 细 = buildSectionMesh(叶堆, false);
    const 粗 = buildSectionMesh(叶堆, true);
    expect(细.镂空.n).toBeGreaterThan(0);
    expect(粗.实心树叶.n).toBeGreaterThan(0);
    expect(粗.实心树叶.n).toBeLessThan(细.镂空.n);
  });
  it('一个小区段的网格（金样）', async () => {
    const 填 = (x: number, y: number, z: number) => {
      if (z === 0) return (x + y) % 3 === 0 ? 2 : 1;
      if (z === 1) return x >= 3 && y <= 2 ? 5 : x === 1 && y === 4 ? 3 : 0;
      if (z === 2) return x === 1 && y === 4 ? 4 : 0;
      return 0;
    };
    const 行们: string[] = [];
    for (const 粗 of [false, true]) {
      const m = buildSectionMesh(区段(5, 4, 填), 粗);
      for (const 材 of ['实心', '镂空', '实心树叶', '水', '花草'] as const) {
        const 组 = m[材];
        行们.push(JSON.stringify({ 粗, 材, n: 组.n, 段: 组.段, pos: Array.from(组.pos), uv: Array.from(组.uv), tex: Array.from(组.tex), col: Array.from(组.col) }));
      }
      行们.push(JSON.stringify({ 粗, 面数: m.面数 }));
    }
    await expect(`[\n${行们.join(',\n')}\n]\n`).toMatchFileSnapshot('./金样/网格.json');
  });
});
