import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { afterAll, describe, expect, it } from 'vitest';
import { 读NBT带名, 写NBT } from './nbt.ts';
import { 方块于, 解码列段, 编码列段, 摊开列, 列号 } from './列段.ts';
import { 世界种子, 状态串, 解紧凑, 读区域 } from './存档.ts';
import { 区域源 } from './区域源.ts';
import { 压紧凑, 造世界, 造区域文件 } from './测试夹具.ts';
import { 目录指纹 } from './版本.ts';
import { 体素模块 } from './体素库.ts';

const 临时 = fs.mkdtempSync(path.join(os.tmpdir(), '世界-存档-'));
afterAll(() => fs.rmSync(临时, { recursive: true, force: true }));

// 小世界：两个区块，y < 60 石头、60 草方块、上面空气；(3, 61, 5) 一块带乱序属性的楼梯，(4, 61, 4) 树叶，(1, 10, 1) 洞穴空气
const 方块 = (x: number, y: number, z: number) => {
  if (x === 3 && y === 61 && z === 5) return 'minecraft:oak_stairs[waterlogged=false,facing=east,half=bottom,shape=straight]';
  if (x === 4 && y === 61 && z === 4) return 'minecraft:oak_leaves[distance=3,persistent=false,waterlogged=false]';
  if (x === 1 && y === 10 && z === 1) return 'minecraft:cave_air';
  return y < 60 ? 'minecraft:stone' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air';
};

describe('NBT 和紧凑数组', () => {
  it('写了能原样读回', () => {
    const buf = 写NBT({ a: { t: 'int', v: -5 }, b: { t: 'string', v: '中文' }, c: { t: 'list', 元素: 'short', v: [{ t: 'short', v: 7 }] }, d: { t: 'long', v: -2n }, e: { t: 'intArray', v: [1, 2] } }, 'Schematic');
    const r = 读NBT带名(buf);
    expect(r.名).toBe('Schematic');
    expect(r.值.a).toBe(-5);
    expect(r.值.b).toBe('中文');
    expect(r.值.c).toEqual([7]);
    expect(r.值.d).toBe(-2n);
    expect([...(r.值.e as Int32Array)]).toEqual([1, 2]);
  });
  it.each([4, 5, 7, 9])('%i 位压了能解回', (bits) => {
    const vals = Array.from({ length: 4096 }, (_, i) => (i * 7919) % (1 << bits));
    const longs = Buffer.alloc(8 * Math.ceil(4096 / Math.floor(64 / bits)));
    压紧凑(vals, bits).forEach((v, i) => longs.writeBigInt64BE(v, 8 * i));
    const out = new Uint16Array(4096);
    解紧凑(longs, bits, 4096, out);
    expect([...out]).toEqual(vals);
  });
});

describe('读存档', () => {
  const dir = path.join(临时, '世界');
  造世界(dir, -123456789012345n, [
    [0, 0, 方块],
    [1, 0, 方块],
  ]);

  it('种子取 level.dat 的十进制', () => expect(世界种子(dir)).toBe('-123456789012345'));

  it('区块解成列段，方块状态照游戏的写法规范化', () => {
    const r = 读区域(path.join(dir, 'region', 'r.0.0.mca'), 0, 0, '1')!;
    expect(r.区块.map((c) => c.join(','))).toEqual(['0,0', '1,0']);
    const d = 解码列段(编码列段(r.列段));
    expect(d.y底).toBe(-64);
    expect(d.y顶).toBe(319);
    expect(方块于(d, 3, 61, 5)!.状态).toBe('minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]');
    expect(方块于(d, 4, 61, 4)!.状态).toBe('minecraft:oak_leaves[waterlogged=false]');
    expect(方块于(d, 1, 10, 1)!.状态).toBe('minecraft:air');
    expect(方块于(d, 20, 60, 3)).toEqual({ 状态: 'minecraft:grass_block[snowy=false]', 群系: 'minecraft:plains' });
    expect(方块于(d, 40, 60, 3)).toBeNull(); // 区块 (2, 0) 不存在
    const col = 摊开列(d, 列号(0, 0, 7, 7))!;
    expect(d.状态表[col.状态[59 + 64]!]).toBe('minecraft:stone');
    expect(d.状态表[col.状态[61 + 64]!]).toBe('minecraft:air');
  });

  it('1.17 及以前的区块格式直接报错，不当成没生成', () => {
    const f = path.join(临时, 'r.0.0.mca');
    fs.writeFileSync(f, 造区域文件(new Map([[0, 写NBT({ DataVersion: { t: 'int', v: 2730 }, Level: { t: 'compound', v: { Status: { t: 'string', v: 'full' } } } })]])));
    expect(() => 读区域(f, 0, 0, '1')).toThrow(/1\.17 及以前.*DataVersion 2730/);
  });

  it('只要几个区块就只解那几个', () => {
    const r = 读区域(path.join(dir, 'region', 'r.0.0.mca'), 0, 0, '1', new Set([1]))!;
    expect(r.区块.map((c) => c.join(','))).toEqual(['1,0']);
  });

  it('状态串：空气并掉、树叶去 distance/persistent、属性排序', () => {
    expect(状态串('minecraft:void_air')).toBe('minecraft:air');
    expect(状态串('minecraft:birch_leaves', { persistent: 'true', distance: '1' })).toBe('minecraft:birch_leaves');
    expect(状态串('minecraft:oak_log', { axis: 'x' })).toBe('minecraft:oak_log[axis=x]');
  });

  it('区域源按区域文件 sha 缓存，第二次从缓存读出一样的', async () => {
    const 缓存 = path.join(临时, '缓存');
    const a = new 区域源(path.join(dir, 'region'), '1', 缓存);
    expect(a.区域文件()).toEqual([[0, 0]]);
    expect(await a.预读([[0, 0]], 1)).toEqual([[0, 0]]);
    const b = new 区域源(path.join(dir, 'region'), '1', 缓存);
    const x = a.区域(0, 0)!, y = b.区域(0, 0)!;
    expect(Buffer.compare(编码列段(x), 编码列段(y))).toBe(0);
    expect(fs.readdirSync(缓存).length).toBe(1);
  });
});

describe('版本', () => {
  it('目录指纹只看文件名和内容', () => {
    const a = path.join(临时, '包a'), b = path.join(临时, '包b');
    for (const d of [a, b]) fs.mkdirSync(d);
    fs.writeFileSync(path.join(a, '包.json'), '{}');
    fs.writeFileSync(path.join(a, '0.0.块'), 'x');
    fs.writeFileSync(path.join(b, '0.0.块'), 'x');
    fs.writeFileSync(path.join(b, '包.json'), '{}');
    fs.writeFileSync(path.join(b, '.DS_Store'), 'junk');
    expect(目录指纹(a)).toBe(目录指纹(b));
    expect(目录指纹(a)).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('体素库', () => {
  it('Node 里执行的 engine/voxel 模块闭包里没有 react、three、remotion', async () => {
    const r = await build({
      entryPoints: 体素模块.map((f) => path.join(import.meta.dirname, '..', '..', 'engine', 'voxel', f)),
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
    const 外部 = Object.values(r.metafile.inputs).flatMap((i) => i.imports.filter((x) => x.external).map((x) => x.path));
    expect(外部.filter((p) => /^(react|three|remotion|@remotion\/)/.test(p))).toEqual([]);
    expect(外部.filter((p) => p.startsWith('asset:')).sort()).toEqual(['asset:数据/场景/关键帧/方块表', 'asset:数据/场景/关键帧/群系色']);
  });
});
