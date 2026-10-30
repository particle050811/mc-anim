import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { 写NBT, type 标签 } from '../nbt.ts';
import { 方块于 } from '../列段.ts';
import { 区域源 } from '../区域源.ts';
import { 造世界 } from '../测试夹具.ts';
import { 体积 } from './命令.ts';
import { 解析编辑, 编辑文件错误 } from './编辑文件.ts';
import { 编辑套用器 } from './套用.ts';
import { 读结构, 变换状态 } from './结构.ts';
import { 加载矩形, 壳与内, 拆盒, 生成重放, 重放脚本 } from './重放.ts';

const 临时 = fs.mkdtempSync(path.join(os.tmpdir(), '世界-编辑-'));
afterAll(() => fs.rmSync(临时, { recursive: true, force: true }));

const 知识 = {
  全部状态: [
    'minecraft:stone',
    'minecraft:glass',
    'minecraft:dirt',
    'minecraft:grass_block[snowy=false]',
    'minecraft:grass_block[snowy=true]',
    ...['x', 'y', 'z'].map((a) => `minecraft:oak_log[axis=${a}]`),
    ...['north', 'east', 'south', 'west'].flatMap((f) => ['bottom', 'top'].map((h) => `minecraft:oak_stairs[facing=${f},half=${h},shape=straight]`)),
  ],
};

const 字 = (v: string): 标签 => ({ t: 'string', v });
const 整 = (v: number): 标签 => ({ t: 'int', v });
const 整表 = (vs: number[]): 标签 => ({ t: 'list', 元素: 'int', v: vs.map(整) });
// 原版结构：2×1×1，(0,0,0) 是 x 向原木，(1,0,0) 是结构空位
const 原版结构 = gzipSync(
  写NBT({
    size: 整表([2, 1, 1]),
    palette: { t: 'list', 元素: 'compound', v: [{ t: 'compound', v: { Name: 字('minecraft:oak_log'), Properties: { t: 'compound', v: { axis: 字('x') } } } }] },
    blocks: { t: 'list', 元素: 'compound', v: [{ t: 'compound', v: { pos: 整表([0, 0, 0]), state: 整(0) } }] },
  }),
);
// Sponge v3：2×1×1，石头、玻璃
const sponge结构 = gzipSync(
  写NBT({
    Schematic: {
      t: 'compound',
      v: {
        Version: 整(3),
        Width: { t: 'short', v: 2 },
        Height: { t: 'short', v: 1 },
        Length: { t: 'short', v: 1 },
        Blocks: { t: 'compound', v: { Palette: { t: 'compound', v: { 'minecraft:stone': 整(0), 'minecraft:glass': 整(1) } }, Data: { t: 'byteArray', v: Uint8Array.from([0, 1]) } } },
      },
    },
  }),
);
const 结构们: Record<string, Buffer> = { '原木.nbt': 原版结构, '石玻.schem': sponge结构 };
const 解析 = (文本: string) => 解析编辑(文本, '/x/测试.编辑.toml', 知识, (名) => 结构们[名] ?? fs.readFileSync(名));

describe('编辑文件', () => {
  it('命令一行一条、# 开头的不算、前面的 / 可写可不写', () => {
    const e = 解析(`"说明" = "试"\n[["步"]]\n"说明" = "铺"\n"命令" = """\n# 注释\n/fill 0 60 0 2 60 2 stone\nsetblock 1 61 1 minecraft:oak_log[axis=y]\n"""\n[["步"]]\n"命令" = ["setblock 0 0 0 air"]`);
    expect(e.步.map((s) => s.种)).toEqual(['fill', 'setblock', 'setblock']);
    expect(e.步[0]!.出处).toBe('测试.编辑.toml 第 1 步');
    expect(e.说明).toBe('试');
    expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('方块状态按方块表校验，报错说清哪一步、表里有什么', () => {
    expect(() => 解析(`[["步"]]\n"命令" = "setblock 0 0 0 minecraft:stonee"`)).toThrow(/第 1 步.*没有 minecraft:stonee（像的有：minecraft:stone/s);
    expect(() => 解析(`[["步"]]\n"命令" = "setblock 0 0 0 oak_log[axis=w]"`)).toThrow(/axis 不能是 w（方块表里有：x、y、z）/);
    expect(() => 解析(`[["步"]]\n"命令" = "setblock 0 0 0 oak_log[color=red]"`)).toThrow(/没有属性 color/);
    // 方块表不导的、不影响外观的属性照写
    expect(解析(`[["步"]]\n"命令" = "setblock 0 0 0 oak_stairs[facing=east,waterlogged=true]"`).步).toHaveLength(1);
    expect(() => 解析(`[["步"]]\n"命令" = "setblock ~ 0 0 stone"`)).toThrow(/绝对坐标/);
    expect(() => 解析(`[["步"]]\n"命令" = "setblock 0 0 0 #minecraft:logs"`)).toThrow(/方块标签/);
    expect(() => 解析(`[["步"]]\n"命令" = "clone 0 0 0 3 3 3 1 1 1"`)).toThrow(/重叠/);
    expect(() => 解析(`[["步"]]\n"命令" = "kill @e"`)).toThrow(编辑文件错误);
  });

  it('几处错一次报全', () => {
    expect(() => 解析(`[["步"]]\n"命令" = ["setblock 0 0 0 nope", "fill 0 0 0 1 1 1 stone bogus"]`)).toThrow(/有 2 处不对/);
  });

  it('结构：原版 .nbt 和 Sponge v3 .schem 都读得出', () => {
    const a = 读结构(原版结构);
    expect(a.大小).toEqual([2, 1, 1]);
    expect(a.格).toEqual(['minecraft:oak_log[axis=x]', null]);
    const b = 读结构(sponge结构);
    expect(b.格式).toBe('schem3');
    expect(b.格).toEqual(['minecraft:stone', 'minecraft:glass']);
  });

  it('方块状态跟着转：facing、axis', () => {
    expect(变换状态('minecraft:oak_stairs[facing=north,half=bottom,shape=straight]', 'clockwise_90', 'none')).toBe('minecraft:oak_stairs[facing=east,half=bottom,shape=straight]');
    expect(变换状态('minecraft:oak_stairs[facing=north,half=bottom,shape=straight]', 'none', 'left_right')).toBe('minecraft:oak_stairs[facing=south,half=bottom,shape=straight]');
    expect(变换状态('minecraft:oak_log[axis=x]', 'counterclockwise_90', 'none')).toBe('minecraft:oak_log[axis=z]');
    expect(变换状态('minecraft:white_banner[rotation=4]', '180', 'none')).toBe('minecraft:white_banner[rotation=12]');
  });

  it('铁轨 shape 跟着转、镜像，门的 hinge 镜像时对调', () => {
    expect(变换状态('minecraft:rail[shape=north_south]', 'clockwise_90', 'none')).toBe('minecraft:rail[shape=east_west]');
    expect(变换状态('minecraft:rail[shape=ascending_east]', 'clockwise_90', 'none')).toBe('minecraft:rail[shape=ascending_south]');
    expect(变换状态('minecraft:rail[shape=south_east]', 'clockwise_90', 'none')).toBe('minecraft:rail[shape=south_west]');
    expect(变换状态('minecraft:rail[shape=north_east]', 'none', 'left_right')).toBe('minecraft:rail[shape=south_east]');
    expect(变换状态('minecraft:powered_rail[powered=false,shape=ascending_west]', 'none', 'front_back')).toBe('minecraft:powered_rail[powered=false,shape=ascending_east]');
    expect(变换状态('minecraft:oak_door[facing=east,half=lower,hinge=left,open=false]', 'none', 'front_back')).toBe('minecraft:oak_door[facing=west,half=lower,hinge=right,open=false]');
    expect(变换状态('minecraft:oak_door[facing=east,half=lower,hinge=left,open=false]', 'clockwise_90', 'none')).toBe('minecraft:oak_door[facing=south,half=lower,hinge=left,open=false]');
    // 楼梯的 shape 不是方向词，转的时候不动
    expect(变换状态('minecraft:oak_stairs[facing=north,half=bottom,shape=inner_left]', 'clockwise_90', 'none')).toBe('minecraft:oak_stairs[facing=east,half=bottom,shape=inner_left]');
  });
});

describe('套用', () => {
  // 两个区块（x 0～31，z 0～15），y 0～79：y < 60 石头，60 草方块，上面空气
  const dir = path.join(临时, '世界');
  造世界(
    dir,
    1n,
    [
      [0, 0, (_x, y) => (y < 60 ? 'minecraft:stone' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air')],
      [1, 0, (_x, y) => (y < 60 ? 'minecraft:stone' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air')],
    ],
    { y底: 0, 段数: 5 },
  );
  const 套 = (文本: string) => {
    const e = 解析(文本);
    const 器 = new 编辑套用器(e, new 区域源(path.join(dir, 'region'), '1', null));
    const 源 = new 区域源(path.join(dir, 'region'), '1', null, (r) => 器.套(r));
    return { 区: 源.区域(0, 0)!, 器 };
  };
  const 状 = (r: ReturnType<typeof 套>['区'], x: number, y: number, z: number) => 方块于(r, x, y, z)?.状态;

  it('fill、setblock、过滤替换按顺序套；没碰到的格不动', () => {
    const { 区 } = 套(`[["步"]]\n"命令" = ["fill 2 58 2 4 62 4 glass", "fill 2 50 2 4 62 4 dirt replace stone", "setblock 3 70 3 oak_log[axis=y]", "setblock 3 70 3 stone keep"]`);
    expect(状(区, 2, 58, 2)).toBe('minecraft:glass'); // 先成玻璃，过滤只换石头
    expect(状(区, 2, 57, 2)).toBe('minecraft:dirt');
    expect(状(区, 2, 49, 2)).toBe('minecraft:stone');
    expect(状(区, 3, 70, 3)).toBe('minecraft:oak_log[axis=y]'); // keep 不换非空气
    expect(状(区, 5, 60, 5)).toBe('minecraft:grass_block[snowy=false]');
    expect(方块于(区, 3, 70, 3)!.群系).toBe('minecraft:plains');
  });

  it('hollow：外壳是方块、里面掏空', () => {
    const { 区 } = 套(`[["步"]]\n"命令" = "fill 10 50 2 14 54 6 glass hollow"`);
    expect(状(区, 10, 52, 4)).toBe('minecraft:glass');
    expect(状(区, 12, 50, 4)).toBe('minecraft:glass');
    expect(状(区, 12, 52, 4)).toBe('minecraft:air');
  });

  it('clone 读的是前面几步改完的世界，跨区块；move 把源清成空气', () => {
    const { 区 } = 套(`[["步"]]\n"命令" = ["setblock 1 61 1 oak_log[axis=x]", "clone 1 61 1 1 61 1 20 61 1", "clone 1 60 1 1 61 1 25 70 5 masked move"]`);
    expect(状(区, 20, 61, 1)).toBe('minecraft:oak_log[axis=x]');
    expect(状(区, 25, 70, 5)).toBe('minecraft:grass_block[snowy=false]');
    expect(状(区, 25, 71, 5)).toBe('minecraft:oak_log[axis=x]');
    expect(状(区, 1, 61, 1)).toBe('minecraft:air');
    expect(状(区, 1, 60, 1)).toBe('minecraft:air');
  });

  it('摆结构：旋转后位置和状态都转；结构空位不动', () => {
    const { 区 } = 套(`[["步"]]\n"命令" = ["place template 原木.nbt 5 61 5 clockwise_90", "place template 石玻.schem 8 61 8 none front_back"]`);
    expect(状(区, 5, 61, 5)).toBe('minecraft:oak_log[axis=z]');
    expect(状(区, 5, 61, 6)).toBe('minecraft:air'); // 结构空位
    expect(状(区, 8, 61, 8)).toBe('minecraft:stone');
    expect(状(区, 7, 61, 8)).toBe('minecraft:glass'); // front_back：x 反过来
  });

  it('没被碰到的区域原样返回同一个对象', () => {
    const e = 解析(`[["步"]]\n"命令" = "setblock 600 61 0 stone"`);
    const 原 = new 区域源(path.join(dir, 'region'), '1', null);
    const r = 原.区域(0, 0)!;
    expect(new 编辑套用器(e, 原).套(r)).toBe(r);
  });

  it('碰到没生成的区块：跳过并警告', () => {
    const { 区, 器 } = 套(`[["步"]]\n"命令" = "fill 30 61 30 40 61 40 stone"`);
    expect(状(区, 30, 61, 30)).toBeUndefined();
    expect([...器.警告].join()).toMatch(/区块没生成/);
  });
});

describe('重放', () => {
  it('超过 32768 格的 fill 拆开，体积不变；hollow 拆成壳和内部', () => {
    const b = { x1: 0, y1: 0, z1: 0, x2: 99, y2: 9, z2: 99 };
    const 块 = 拆盒(b);
    expect(块.every((x) => 体积(x) <= 32768)).toBe(true);
    expect(块.reduce((a, x) => a + 体积(x), 0)).toBe(体积(b));
    const { 壳, 内 } = 壳与内(b);
    expect(壳.reduce((a, x) => a + 体积(x), 0) + 体积(内!)).toBe(体积(b));
    expect(体积(内!)).toBe(98 * 8 * 98);
  });

  it('强制加载按 16×16 区块分组', () => {
    const r = 加载矩形([{ x1: 0, y1: 0, z1: 0, x2: 300, y2: 0, z2: 10 }]);
    expect(r).toEqual([
      [0, 0, 255, 15],
      [256, 0, 303, 15],
    ]);
  });

  it('生成 execute in 前缀的命令、结构展开成 fill/setblock、sh 脚本', () => {
    const e = 解析(`[["步"]]\n"命令" = ["fill 0 0 0 99 9 99 stone", "place template 石玻.schem 8 61 8"]`);
    const r = 生成重放(e, 'minecraft:overworld');
    expect(r.命令.every((c) => c.startsWith('execute in minecraft:overworld run '))).toBe(true);
    expect(r.命令.at(-2)).toBe('execute in minecraft:overworld run setblock 8 61 8 minecraft:stone');
    expect(r.命令.at(-1)).toBe('execute in minecraft:overworld run setblock 9 61 8 minecraft:glass');
    expect(r.加载[0]).toBe('execute in minecraft:overworld run forceload add 0 0 111 111');
    const sh = 重放脚本(r, '测试');
    expect(sh).toContain(`"$ANIM" mcai batch`);
    expect(sh).toContain(`'cmd execute in minecraft:overworld run setblock 9 61 8 minecraft:glass'`);
  });
});
