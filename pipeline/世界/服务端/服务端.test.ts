import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { 解析启用包, 开服前核对, 排序核对 } from './核对.ts';
import { 启动参数, 撤临时模组 } from './服务端.ts';
import { 只读zip } from './zip.ts';

/** 测试用的最小 zip 写入器：第一个条目 stored，其余 deflate */
const 写zip = (f: string, 条目: Record<string, string>) => {
  const 本地: Buffer[] = [], 中央: Buffer[] = [];
  let 偏 = 0;
  Object.entries(条目).forEach(([名, 文], i) => {
    const 原 = Buffer.from(文), 数据 = i ? deflateRawSync(原) : 原, n = Buffer.from(名);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(i ? 8 : 0, 8);
    h.writeUInt32LE(数据.length, 18);
    h.writeUInt32LE(原.length, 22);
    h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(i ? 8 : 0, 10);
    c.writeUInt32LE(数据.length, 20);
    c.writeUInt32LE(原.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(偏, 42);
    本地.push(h, n, 数据);
    中央.push(c, n);
    偏 += 30 + n.length + 数据.length;
  });
  const cd = Buffer.concat(中央);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(中央.length / 2, 8);
  e.writeUInt16LE(中央.length / 2, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(偏, 16);
  fs.writeFileSync(f, Buffer.concat([...本地, cd, e]));
};

const 临时 = () => fs.mkdtempSync(path.join(os.tmpdir(), '服务端-'));

describe('服务端', () => {
  it('zip：stored、deflate 都读得出', () => {
    const d = 临时();
    写zip(path.join(d, 'a.zip'), { 'a.txt': '甲', 'b/c.json': '{"x":1}' });
    const z = new 只读zip(path.join(d, 'a.zip'));
    expect(z.名们()).toEqual(['a.txt', 'b/c.json']);
    expect(z.读('a.txt').toString()).toBe('甲');
    expect(z.读('b/c.json').toString()).toBe('{"x":1}');
    fs.rmSync(d, { recursive: true });
  });

  it('启动参数：认 Forge 的参数文件，几个版本时按声明挑；原版认 server.jar', () => {
    const d = 临时();
    const 参数文件 = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
    for (const v of ['1.20.1-47.4.10', '1.20.1-47.2.0']) {
      fs.mkdirSync(path.join(d, 'libraries/net/minecraftforge/forge', v), { recursive: true });
      fs.writeFileSync(path.join(d, 'libraries/net/minecraftforge/forge', v, 参数文件), '');
    }
    expect(() => 启动参数(d)).toThrow(/几个版本/);
    expect(启动参数(d, '1.20.1-47.4.10')).toEqual([`@libraries/net/minecraftforge/forge/1.20.1-47.4.10/${参数文件}`, 'nogui']);
    const v = 临时();
    fs.writeFileSync(path.join(v, 'server.jar'), '');
    expect(启动参数(v)).toEqual(['-jar', 'server.jar', 'nogui']);
    expect(() => 启动参数(临时())).toThrow(/认不出/);
    fs.rmSync(d, { recursive: true });
  });

  it('上次没删的临时模组按记录删，人装的不动', () => {
    const d = 临时();
    fs.mkdirSync(path.join(d, 'mods'));
    fs.writeFileSync(path.join(d, 'mods', 'Chunky.jar'), '');
    fs.writeFileSync(path.join(d, 'mods', '人装的.jar'), '');
    fs.writeFileSync(path.join(d, '.anim-临时模组.json'), JSON.stringify(['Chunky.jar']));
    expect(撤临时模组(d)).toEqual(['Chunky.jar']);
    expect(fs.readdirSync(path.join(d, 'mods'))).toEqual(['人装的.jar']);
    expect(撤临时模组(d)).toEqual([]);
    fs.rmSync(d, { recursive: true });
  });

  it('修整包要含修整类的 mcai jar，启用了还要排在它覆盖的包之上', () => {
    const 服 = 临时(), 世 = 临时();
    fs.mkdirSync(path.join(服, 'mods'));
    const 包 = path.join(世, 'datapacks');
    fs.mkdirSync(path.join(包, '主世界修整', 'data', 'minecraft', 'worldgen', 'density_function', 'overworld'), { recursive: true });
    fs.writeFileSync(path.join(包, '主世界修整', 'pack.mcmeta'), '{}');
    fs.writeFileSync(path.join(包, '主世界修整', 'data', 'minecraft', 'worldgen', 'density_function', 'overworld', 'continents.json'), '{"type":"mcai:edit"}');
    写zip(path.join(包, 'epicterrain.zip'), { 'pack.mcmeta': '{}', 'data/minecraft/worldgen/density_function/overworld/continents.json': '{}' });
    写zip(path.join(服, 'mods', 'mcai-0.1.0.jar'), { 'mcai/Mcai.class': '' });
    expect(开服前核对(服, 世).问题.join()).toMatch(/主世界修整 用到生成时修整/);
    写zip(path.join(服, 'mods', 'mcai-0.1.0.jar'), { 'mcai/terrain/TerrainTypes.class': '' });
    expect(开服前核对(服, 世)).toEqual({ 问题: [], 要盖: ['主世界修整'] });
    const 行 = 'There are 3 data pack(s) enabled: [vanilla (built-in)], [file/主世界修整 (world)], [file/epicterrain.zip (world)]';
    expect(解析启用包(行)).toEqual(['vanilla', 'file/主世界修整', 'file/epicterrain.zip']);
    expect(排序核对(世, ['主世界修整'], 解析启用包(行)).join()).toMatch(/排在 file\/epicterrain.zip 下面/);
    expect(排序核对(世, ['主世界修整'], ['vanilla', 'file/epicterrain.zip', 'file/主世界修整'])).toEqual([]);
    expect(排序核对(世, ['主世界修整'], ['vanilla'])).toHaveLength(1);
    fs.rmSync(服, { recursive: true });
    fs.rmSync(世, { recursive: true });
  });
});
