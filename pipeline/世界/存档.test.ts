import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { afterAll, describe, expect, it } from 'vitest';
import { readNbtNamed, writeNbt } from './nbt.ts';
import { blockAt, decodeColumnSegments, encodeColumnSegments, spreadColumn, columnIndex } from './列段.ts';
import { worldSeed, stateString, unpackCompact, readRegion } from './存档.ts';
import { RegionSource } from './区域源.ts';
import { packCompact, makeWorld, makeRegionFile } from './测试夹具.ts';
import { dirFingerprint } from './版本.ts';
import { VOXEL_MODULES } from './体素库.ts';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '世界-存档-'));
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

// 小世界：两个区块，y < 60 石头、60 草方块、上面空气；(3, 61, 5) 一块带乱序属性的楼梯，(4, 61, 4) 树叶，(1, 10, 1) 洞穴空气
const expectedBlock = (x: number, y: number, z: number) => {
  if (x === 3 && y === 61 && z === 5) return 'minecraft:oak_stairs[waterlogged=false,facing=east,half=bottom,shape=straight]';
  if (x === 4 && y === 61 && z === 4) return 'minecraft:oak_leaves[distance=3,persistent=false,waterlogged=false]';
  if (x === 1 && y === 10 && z === 1) return 'minecraft:cave_air';
  return y < 60 ? 'minecraft:stone' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air';
};

describe('NBT 和紧凑数组', () => {
  it('写了能原样读回', () => {
    const buf = writeNbt({ a: { t: 'int', v: -5 }, b: { t: 'string', v: '中文' }, c: { t: 'list', elementType: 'short', v: [{ t: 'short', v: 7 }] }, d: { t: 'long', v: -2n }, e: { t: 'intArray', v: [1, 2] } }, 'Schematic');
    const r = readNbtNamed(buf);
    expect(r.name).toBe('Schematic');
    expect(r.value.a).toBe(-5);
    expect(r.value.b).toBe('中文');
    expect(r.value.c).toEqual([7]);
    expect(r.value.d).toBe(-2n);
    expect([...(r.value.e as Int32Array)]).toEqual([1, 2]);
  });
  it.each([4, 5, 7, 9])('%i 位压了能解回', (bits) => {
    const vals = Array.from({ length: 4096 }, (_, i) => (i * 7919) % (1 << bits));
    const longs = Buffer.alloc(8 * Math.ceil(4096 / Math.floor(64 / bits)));
    packCompact(vals, bits).forEach((v, i) => longs.writeBigInt64BE(v, 8 * i));
    const out = new Uint16Array(4096);
    unpackCompact(longs, bits, 4096, out);
    expect([...out]).toEqual(vals);
  });
});

describe('读存档', () => {
  const dir = path.join(tempDir, '世界');
  makeWorld(dir, -123456789012345n, [
    [0, 0, expectedBlock],
    [1, 0, expectedBlock],
  ]);

  it('种子取 level.dat 的十进制', () => expect(worldSeed(dir)).toBe('-123456789012345'));

  it('区块解成列段，方块状态照游戏的写法规范化', () => {
    const r = readRegion(path.join(dir, 'region', 'r.0.0.mca'), 0, 0, '1')!;
    expect(r.chunks.map((c) => c.join(','))).toEqual(['0,0', '1,0']);
    const d = decodeColumnSegments(encodeColumnSegments(r.columnSeg));
    expect(d.yBottom).toBe(-64);
    expect(d.yTop).toBe(319);
    expect(blockAt(d, 3, 61, 5)!.state).toBe('minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]');
    expect(blockAt(d, 4, 61, 4)!.state).toBe('minecraft:oak_leaves[waterlogged=false]');
    expect(blockAt(d, 1, 10, 1)!.state).toBe('minecraft:air');
    expect(blockAt(d, 20, 60, 3)).toEqual({ state: 'minecraft:grass_block[snowy=false]', biome: 'minecraft:plains' });
    expect(blockAt(d, 40, 60, 3)).toBeNull(); // 区块 (2, 0) 不存在
    const col = spreadColumn(d, columnIndex(0, 0, 7, 7))!;
    expect(d.stateTable[col.state[59 + 64]!]).toBe('minecraft:stone');
    expect(d.stateTable[col.state[61 + 64]!]).toBe('minecraft:air');
  });

  it('1.17 及以前的区块格式直接报错，不当成没生成', () => {
    const f = path.join(tempDir, 'r.0.0.mca');
    fs.writeFileSync(f, makeRegionFile(new Map([[0, writeNbt({ DataVersion: { t: 'int', v: 2730 }, Level: { t: 'compound', v: { Status: { t: 'string', v: 'full' } } } })]])));
    expect(() => readRegion(f, 0, 0, '1')).toThrow(/1\.17 及以前.*DataVersion 2730/);
  });

  it('只要几个区块就只解那几个', () => {
    const r = readRegion(path.join(dir, 'region', 'r.0.0.mca'), 0, 0, '1', new Set([1]))!;
    expect(r.chunks.map((c) => c.join(','))).toEqual(['1,0']);
  });

  it('状态串：空气并掉、树叶去 distance/persistent、属性排序', () => {
    expect(stateString('minecraft:void_air')).toBe('minecraft:air');
    expect(stateString('minecraft:birch_leaves', { persistent: 'true', distance: '1' })).toBe('minecraft:birch_leaves');
    expect(stateString('minecraft:oak_log', { axis: 'x' })).toBe('minecraft:oak_log[axis=x]');
  });

  it('区域源按区域文件 sha 缓存，第二次从缓存读出一样的', async () => {
    const cacheDir = path.join(tempDir, '缓存');
    const a = new RegionSource(path.join(dir, 'region'), '1', cacheDir);
    expect(a.regionFiles()).toEqual([[0, 0]]);
    expect(await a.preRead([[0, 0]], 1)).toEqual([[0, 0]]);
    const b = new RegionSource(path.join(dir, 'region'), '1', cacheDir);
    const x = a.region(0, 0)!, y = b.region(0, 0)!;
    expect(Buffer.compare(encodeColumnSegments(x), encodeColumnSegments(y))).toBe(0);
    expect(fs.readdirSync(cacheDir).length).toBe(1);
  });
});

describe('版本', () => {
  it('目录指纹只看文件名和内容', () => {
    const a = path.join(tempDir, '包a'), b = path.join(tempDir, '包b');
    for (const d of [a, b]) fs.mkdirSync(d);
    fs.writeFileSync(path.join(a, '包.json'), '{}');
    fs.writeFileSync(path.join(a, '0.0.块'), 'x');
    fs.writeFileSync(path.join(b, '0.0.块'), 'x');
    fs.writeFileSync(path.join(b, '包.json'), '{}');
    fs.writeFileSync(path.join(b, '.DS_Store'), 'junk');
    expect(dirFingerprint(a)).toBe(dirFingerprint(b));
    expect(dirFingerprint(a)).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('体素库', () => {
  it('Node 里执行的 engine/voxel 模块闭包里没有 react、three、remotion', async () => {
    const r = await build({
      entryPoints: VOXEL_MODULES.map((f) => path.join(import.meta.dirname, '..', '..', 'engine', 'voxel', f)),
      bundle: true,
      write: false,
      metafile: true,
      outdir: 'out',
      platform: 'node',
      format: 'esm',
      packages: 'external',
      plugins: [{ name: '资产', setup: (b) => b.onResolve({ filter: /^asset:/ }, (a) => ({ path: a.path, external: true })) }],
      logLevel: 'silent',
    });
    const externalImports = Object.values(r.metafile.inputs).flatMap((i) => i.imports.filter((x) => x.external).map((x) => x.path));
    expect(externalImports.filter((p) => /^(react|three|remotion|@remotion\/)/.test(p))).toEqual([]);
    expect(externalImports.filter((p) => p.startsWith('asset:')).sort()).toEqual(['asset:数据/场景/关键帧/方块表', 'asset:数据/场景/关键帧/群系色']);
  });
});
