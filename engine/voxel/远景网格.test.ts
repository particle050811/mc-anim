// readDistantGrid 在内存数据源上：取哪些文件、什么顺序（页面上请求数和 await 先后不能变）、解出来的网格、缺加密层时的提示、按源去重。
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryDataSource } from '../core/内存数据源.ts';
import { distantTop, readDistantGrid } from './远景网格.ts';

const gz = (a: ArrayBufferView) => new Uint8Array(gzipSync(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)));
const dir = 'terrain/测试-远景/v1';
// 3×2 的粗网格，32 米一格；中层一块 2×2（块边 32），细带缺
const meta = { x0: 0, z0: 0, step: 32, nx: 3, nz: 2, seaLevel: 63, biomeNames: ['minecraft:plains', 'minecraft:ocean'], biomeTemps: [0.8, 0.5] };
const height = new Int16Array([70, 72, 74, 60, 62, 64]);
const biome = new Uint8Array([0, 0, 1, 1, 0, 1]);
const midMeta = { step: 16, tileEdge: 32, n: 2, tile: [[0, 0]] };
const midDeltas = new Int16Array([10, 20, -10, 0]);
const baseFiles = {
  [`${dir}/远景.高.bin.gz`]: gz(height),
  [`${dir}/远景.群.bin.gz`]: gz(biome),
  [`${dir}/远景.中.json`]: JSON.stringify(midMeta),
  [`${dir}/远景.中.bin.gz`]: gz(midDeltas),
};

afterEach(() => vi.restoreAllMocks());

describe('readDistantGrid', () => {
  it('主世界包：先 远景.json，再高、群，再逐层加密层；缺细带只提示', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = memoryDataSource({ [`${dir}/远景.json`]: JSON.stringify(meta), ...baseFiles });
    const grid = await readDistantGrid(src, dir, '测试-远景');
    expect(src.requests).toEqual([`${dir}/远景.json`, `${dir}/远景.高.bin.gz`, `${dir}/远景.群.bin.gz`, `${dir}/远景.中.json`, `${dir}/远景.中.bin.gz`, `${dir}/远景.细.json`]);
    expect(warn.mock.calls).toEqual([['远景：测试-远景 没有细带（远景.细.json），跑 npm run 远景:细带']]);
    expect([...grid.height]).toEqual([...height]);
    expect([...grid.biomeIndex]).toEqual([...biome]);
    expect(grid.biomeTemperature).toEqual(meta.biomeTemps);
    expect(grid.layers.map((l) => [l.name, l.step, l.tileEdge, l.n, l.tile.size, [...l.差]])).toEqual([['中', 16, 32, 2, 1, [10, 20, -10, 0]]]);
    expect(grid.surface).toBeUndefined();
    // 中层块里的点加上差（分米）：(0.5, 0.5) 正好落在块的第 0 点
    expect(distantTop(grid, 0.5, 0.5)).toBe(70 + 1);
  });

  it('暮色包（远景.json 有 地表名）：多取地表、冠顶、冠底三张，带中层、细带', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const surfaceNames = ['minecraft:grass_block', 'minecraft:podzol'];
    const surface = new Uint8Array([1, 0, 1, 0, 1, 0]);
    const crownTop = new Int16Array([-32768, 90, 91, -32768, -32768, 92]);
    const crownBottom = new Int16Array([-32768, 85, 86, -32768, -32768, 87]);
    const fineMeta = { step: 8, tileEdge: 16, n: 2, tile: [[16, 0]] };
    const src = memoryDataSource({
      [`${dir}/远景.json`]: JSON.stringify({ ...meta, surfaceNames }),
      ...baseFiles,
      [`${dir}/远景.地表.bin.gz`]: gz(surface),
      [`${dir}/远景.冠顶.bin.gz`]: gz(crownTop),
      [`${dir}/远景.冠底.bin.gz`]: gz(crownBottom),
      [`${dir}/远景.细.json`]: JSON.stringify(fineMeta),
      [`${dir}/远景.细.bin.gz`]: gz(new Int16Array([5, 5, 5, 5])),
    });
    const grid = await readDistantGrid(src, dir, '测试-远景');
    expect(src.requests).toEqual([
      `${dir}/远景.json`,
      `${dir}/远景.高.bin.gz`,
      `${dir}/远景.群.bin.gz`,
      `${dir}/远景.地表.bin.gz`,
      `${dir}/远景.冠顶.bin.gz`,
      `${dir}/远景.冠底.bin.gz`,
      `${dir}/远景.中.json`,
      `${dir}/远景.中.bin.gz`,
      `${dir}/远景.细.json`,
      `${dir}/远景.细.bin.gz`,
    ]);
    expect(warn).not.toHaveBeenCalled();
    expect(grid.surfaceNames).toEqual(surfaceNames);
    expect([...grid.surface!]).toEqual([...surface]);
    expect([...grid.crownTop!]).toEqual([...crownTop]);
    expect([...grid.crownBottom!]).toEqual([...crownBottom]);
    expect(grid.layers.map((l) => l.name)).toEqual(['中', '细']);
  });

  it('同一个源同一版目录只取一次；别的源各取各的', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const files = { [`${dir}/远景.json`]: JSON.stringify(meta), ...baseFiles };
    const a = memoryDataSource(files), b = memoryDataSource(files);
    const first = await readDistantGrid(a, dir, '测试-远景');
    expect(await readDistantGrid(a, dir, '测试-远景')).toBe(first);
    expect(a.requests.length).toBe(6);
    expect(await readDistantGrid(b, dir, '测试-远景')).not.toBe(first);
  });

  it('缺 远景.json：报取不到和怎么生成', async () => {
    await expect(readDistantGrid(memoryDataSource({}), dir, '测试-远景')).rejects.toThrow(`取不到 ${dir}/远景.json（404），先跑 npm run 远景:主世界-116`);
  });
});
