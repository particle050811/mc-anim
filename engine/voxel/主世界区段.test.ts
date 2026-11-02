import { describe, expect, it, vi } from 'vitest';
import type { VoxelGrid } from './生成.ts';
import type { OverworldContext } from './主世界区段.ts';

vi.mock('./真实方块表.ts', () => {
  const names = ['minecraft:stone', 'minecraft:grass_block', 'minecraft:grass', 'minecraft:water', 'minecraft:ice'];
  return {
    blockNames: names,
    voxelFromState: (name: string) => names.indexOf(name) + 1,
    blockProps: { full: [0, 1, 1, 0, 0, 1], leaf: [0, 0, 0, 0, 0, 0] },
    blockTint: () => 0x80c040,
  };
});
vi.mock('./远景.ts', () => ({
  distantTop: () => 30,
  distantBiome: () => 'minecraft:plains',
  waterFreezes: () => false,
  distantSection: vi.fn((_grid, _origin, _section, want?: (col: number) => boolean) => ({
    nx: 2, ny: 2, nz: 2, 格: 2, 原点: [0, 0, -4], 水面: -1,
    vox: Uint16Array.from({ length: 8 }, (_, i) => (!want || want(i % 4)) ? 1 : 0),
    色板: [{ v: 0, c: [255, 255, 255] }, { v: 1, c: [255, 255, 255] }],
  })),
}));
vi.mock('./远景地面草.ts', () => ({ coarseGroundPlant: () => 'minecraft:grass' }));
vi.mock('./远景海底.ts', () => ({ coarseSeaPlant: () => null }));

const { completeOverworldSection, seamCorrection } = await import('./主世界区段.ts');
const { distantSection } = await import('./远景.ts');
const section = { L: 1, i: 0, j: 0 };
const context = (): OverworldContext => ({
  grid: { packName: '测试', x0: 0, z0: 0, step: 32, nx: 2, nz: 2, 海平面: 63, 高: new Int16Array(4), 群: new Uint8Array(4), 群系名: ['minecraft:plains'], 温度: [0.8], 层: [{ 名: '细', step: 8, 块边: 16, n: 3, 块: new Map([[0, 0]]), 差: new Int16Array(9) }] },
  origin: [0, 64, 0],
  coarseHeights: { 格: 16, x0: 0, y0: 0, nx: 2, ny: 2, 高: new Int16Array(4).fill(64) },
  seam: { x0: 0, y0: 0, nx: 2, ny: 2, cellSize: 16, deltas: Int16Array.of(10, 20, 30, 40) },
});
const voxels = (): VoxelGrid => ({ nx: 2, ny: 2, nz: 1, 格: 2, 原点: [0, 0, 0], vox: new Uint16Array(4).fill(1), 色板: [{ v: 0, c: [255, 255, 255] }, { v: 2, c: [255, 255, 255] }] });

describe('主世界区段工人边界', () => {
  it('结构化克隆后的 Map、类型数组和交界修正与同步来源一致；补草扩高', () => {
    const ctx = context();
    const a = completeOverworldSection(voxels(), section, ctx);
    const b = completeOverworldSection(structuredClone(voxels()), section, structuredClone(ctx));
    expect(b).toEqual(a);
    expect(b.nz).toBe(2);
    expect([...b.vox.slice(4)]).toEqual([2, 2, 2, 2]);
    expect(b.色板[2]).toEqual({ v: 3, c: [128, 192, 64] });
    expect(seamCorrection(ctx.seam!, ctx.origin)(16, -16)).toBe(2.5);
    expect(seamCorrection(structuredClone(ctx.seam!), ctx.origin)(16, -16)).toBe(2.5);
  });

  it('整列挖空不补，缺列补远景，合并后的原点和高度一起返回', () => {
    const v = voxels();
    v.vox[0] = 0; v.vox[1] = 0;
    v.挖空 = Uint8Array.of(1, 0, 0, 0);
    const out = completeOverworldSection(v, section, context());
    expect(out.原点[2]).toBe(-4);
    expect(out.nz).toBe(4);
    expect(Array.from({ length: out.nz }, (_, k) => out.vox[k * 4])).toEqual([0, 0, 0, 0]);
    expect(out.vox[1]).not.toBe(0);
    expect(out.vox[5]).not.toBe(0);
    const want = vi.mocked(distantSection).mock.calls.at(-1)![3]!;
    expect(want(0)).toBe(false);
    expect(want(1)).toBe(true);
    expect(want(2)).toBe(false);
  });

  it('粗级海底盖住水面时按粗高度图补水，不把浅海当成陆地补草', () => {
    const ctx = context();
    ctx.coarseHeights.x0 = -16; ctx.coarseHeights.y0 = -16;
    ctx.coarseHeights.高.fill(-1);
    const v = voxels();
    v.原点[2] = -2;
    const out = completeOverworldSection(v, section, ctx);
    expect(out.nz).toBe(1);
    expect(out.水面).toBe(-1);
    expect([...out.vox]).toEqual([2, 2, 2, 2]);
    expect(out.色板[2].v).toBe(4);
  });

  it('无导入区段仍走整块远景，粗级水面高度不丢', () => {
    const out = completeOverworldSection(null, section, context());
    expect(out.水面).toBe(-1);
    expect(out.原点[2]).toBe(-4);
    expect(vi.mocked(distantSection).mock.calls.at(-1)![3]).toBeUndefined();
  });
});
