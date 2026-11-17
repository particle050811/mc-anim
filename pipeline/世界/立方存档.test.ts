import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { blockAt, encodeColumnSegments } from './列段.ts';
import { RegionSource } from './区域源.ts';
import { saveFormat } from './存档格式.ts';
import { cubeIndex, listCubicRegions, lz4Block, readCubicRegion } from './立方存档.ts';
import { makeCubicWorld } from './测试夹具.ts';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '世界-立方-'));
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

// cube y 256、257、258 = 世界 y 4096～4143。地面：y < 4104 石头、4104 草方块、上面空气
const ground = (_x: number, y: number) => (y < 4104 ? 'minecraft:stone' : y === 4104 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air');
const air = () => 'minecraft:air';
const yRange = [4096, 4143] as const;
const dir = path.join(tempDir, '世界');
makeCubicWorld(dir, 7n, [
  // 区块 (0, 0)：地面那个 cube 和上面一个空气 cube 都存着
  [0, 256, 0, ground],
  [0, 257, 0, air],
  // 区块 (1, 0)：只存了地面那个 cube，上面没存。地表在 cube 里面（上面还有存着的空气格），算知道地表
  [1, 256, 0, ground],
  // 区块 (2, 0)：只存了地下一截（整个 cube 是石头），上面没存：不知道地表
  [2, 256, 0, () => 'minecraft:stone'],
  // 区块 (3, 0)：地面在 257 那个 cube（y 4120 以下泥土），下面 256 没存：当石头
  [3, 257, 0, (_x, y) => (y < 4120 ? 'minecraft:dirt' : 'minecraft:air')],
  [3, 258, 0, air],
  // 区块 (4, 0)：地面那个 cube 没生成完（status 2），不收
  [4, 256, 0, ground, 2],
  [4, 257, 0, air],
  // 另一个列段区域（文件 X = 2 → rx 1）
  [32, 256, 0, ground],
]);
const files = (rx: number) => saveFormat({ kind: 'mcr3d', yRange: [4096, 4143] }).files(path.join(dir, 'cubes'), rx, 0);

describe('立方存档（mcr3d）', () => {
  it('LZ4 原始块：字面量和重叠的回抄', () => {
    // 字面量 "ab"，回抄偏移 2、长 6（重叠），再字面量 "c"
    expect(lz4Block(Uint8Array.from([0x22, 0x61, 0x62, 2, 0, 0x10, 0x63]), 9).toString()).toBe('ababababc');
    expect(() => lz4Block(Uint8Array.from([0x22, 0x61, 0x62, 9, 0]), 8)).toThrow(/LZ4/);
  });

  it('文件按 X >> 1、Z >> 1 归到列段区域，项号 y、z、x', () => {
    expect([...listCubicRegions(path.join(dir, 'cubes'))]).toEqual([
      ['0,0', ['r.0.16.0.mcr3d']],
      ['1,0', ['r.2.16.0.mcr3d']],
    ]);
    expect(cubeIndex(1, 2, 3)).toBe(0x231);
  });

  it('读成列段：地表、没存的上下、没生成完的 cube', () => {
    const r = readCubicRegion(files(0), 0, 0, '7', yRange)!;
    expect([r.columnSeg.yBottom, r.columnSeg.yTop]).toEqual([4096, 4143]);
    expect(r.chunks.map((c) => c.join(',')).sort()).toEqual(['0,0', '1,0', '3,0']);
    const region = new RegionSource(path.join(dir, 'cubes'), '7', path.join(tempDir, '缓存'), null, saveFormat({ kind: 'mcr3d', yRange: [4096, 4143] })).region(0, 0)!;
    expect(blockAt(region, 5, 4104, 5)).toEqual({ state: 'minecraft:grass_block[snowy=false]', biome: 'minecraft:plains' });
    expect(blockAt(region, 5, 4103, 5)!.state).toBe('minecraft:stone');
    expect(blockAt(region, 5, 4140, 5)!.state).toBe('minecraft:air'); // 258 那个 cube 没存，在地表上面当空气
    expect(blockAt(region, 20, 4104, 5)!.state).toBe('minecraft:grass_block[snowy=false]');
    expect(blockAt(region, 36, 4100, 5)).toBeNull(); // 只存了地下一截
    expect(blockAt(region, 52, 4119, 5)!.state).toBe('minecraft:dirt');
    expect(blockAt(region, 52, 4100, 5)!.state).toBe('minecraft:stone'); // 地表下面没存的当石头
    expect(blockAt(region, 68, 4100, 5)).toBeNull(); // 没生成完
  });

  it('区域源：按一组文件的名字和内容缓存，第二次读出一样的', async () => {
    const cacheDir = path.join(tempDir, '缓存2');
    const format = saveFormat({ kind: 'mcr3d', yRange: [4096, 4143] });
    const a = new RegionSource(path.join(dir, 'cubes'), '7', cacheDir, null, format);
    expect(a.regionFiles()).toEqual([[0, 0], [1, 0]]);
    expect(a.has(1, 0)).toBe(true);
    expect(a.has(2, 0)).toBe(false);
    expect(await a.preRead([[0, 0], [1, 0]], 1)).toEqual([[0, 0], [1, 0]]);
    const b = new RegionSource(path.join(dir, 'cubes'), '7', cacheDir, null, format);
    expect(Buffer.compare(encodeColumnSegments(a.region(0, 0)!), encodeColumnSegments(b.region(0, 0)!))).toBe(0);
    expect(fs.readdirSync(cacheDir).length).toBe(2);
    // 高度范围进缓存键：换了范围不拿旧缓存
    const c = new RegionSource(path.join(dir, 'cubes'), '7', cacheDir, null, saveFormat({ kind: 'mcr3d', yRange: [4096, 4127] }));
    expect(c.region(0, 0)!.yTop).toBe(4127);
    expect(fs.readdirSync(cacheDir).length).toBe(3);
  });
});
