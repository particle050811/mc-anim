import { describe, expect, it } from 'vitest';
import { 标准面, 对应状态, 按方块分, 拆状态, 核对方块, 核对群系, 报告文本, type 方块表, type 群系表 } from './核对.ts';

// 面：[朝向, 剔除, 贴图, 叠加, 染色, 标志, 四角 xyz…, 四角 uv…]
const 顶 = (t: number, 起 = 0) => {
  const 角 = [[0, 16, 16, 0, 0], [16, 16, 16, 16, 0], [16, 0, 16, 16, 16], [0, 0, 16, 0, 16]];
  const r = [...角.slice(起), ...角.slice(0, 起)];
  return ['+z', '+z', t, -1, 0, 1, ...r.flatMap((c) => c.slice(0, 3)), ...r.flatMap((c) => c.slice(3))];
};

describe('方块表核对', () => {
  it('拆状态、按默认状态补属性', () => {
    expect(拆状态('minecraft:oak_log[axis=y]')).toEqual({ 方块: 'minecraft:oak_log', 属性: { axis: 'y' } });
    const 表: 方块表 = {
      贴图: [],
      面组: [],
      方块: {
        'a:b[facing=north,lit=false]': [0, null],
        'a:b[facing=east,lit=false]': [0, null],
        'a:b[facing=east,lit=true]': [0, null],
        'a:b[facing=north,lit=true]': [0, null],
      },
    };
    const 分 = 按方块分(表);
    expect(对应状态('a:b[facing=east]', 分)).toBe('a:b[facing=east,lit=false]');
    expect(对应状态('a:b', 分)).toBe('a:b[facing=north,lit=false]');
    expect(对应状态('a:b[lit=true]', 分)).toBe('a:b[facing=north,lit=true]');
    expect(对应状态('a:b[facing=up]', 分)).toBeUndefined();
    expect(对应状态('a:c', 分)).toBeUndefined();
  });

  it('面换起头角、贴图号不同也算同一个面', () => {
    expect(标准面(顶(0, 0), ['x:a'])).toBe(标准面(顶(1, 2), ['x:b', 'x:a']));
    expect(标准面(顶(0), ['x:a'])).not.toBe(标准面(顶(0), ['x:b']));
  });

  it('分出一致、贴图不同、几何不同、标志和染色差异、多出的状态', () => {
    const 手写: 方块表 = {
      贴图: ['minecraft:block/stone', 'minecraft:block/dirt'],
      面组: [[顶(0)], [顶(1)], [顶(0).map((v, i) => (i === 8 ? 8 : v))]],
      方块: {
        'minecraft:stone': [28, null, 0],
        'minecraft:dirt': [28, null, 0],
        'minecraft:slab[type=bottom]': [1, null, 2],
        'minecraft:grass': [1, 'grass', 0],
        'minecraft:gone': [28, null, 0],
      },
    };
    const 导出: 方块表 = {
      贴图: ['minecraft:block/dirt', 'minecraft:block/stone'],
      面组: [[顶(1, 1)], [顶(0)], [顶(1)]],
      方块: {
        'minecraft:stone': [28, null, 0],
        'minecraft:dirt': [28, null, 1],
        'minecraft:slab[type=bottom,waterlogged=false]': [1, null, 0],
        'minecraft:slab[type=bottom,waterlogged=true]': [1, null, 0],
        'minecraft:grass': [2, '#123456', 0],
        'mymod:thing': [28, null, 0],
      },
      附加: { 不画: [] },
    };
    const r = 核对方块(导出, 手写);
    expect(r.对上).toBe(4);
    expect(r.面.一致).toBe(2); // stone 只差起头角；grass 面一样、标志和染色不同
    expect(r.面.贴图不同).toBe(1); // dirt：手写写成了 stone
    expect(r.面.几何不同).toBe(1); // slab
    expect(r.只在手写的方块).toEqual(['minecraft:gone']);
    expect(r.标志不同['类']).toEqual({ 数: 1, 组合: { 'cutout→translucent': 1 }, 例: ['minecraft:grass'] });
    expect(r.染色不同.组合).toEqual({ 'grass→#123456': 1 });
    expect(r.多出的状态.数).toBe(2);
    expect(r.多出的状态.按命名空间).toEqual({ minecraft: 1, mymod: 1 });
    expect(r.只在导出的方块.例).toEqual(['mymod:thing']);
    expect(报告文本(undefined, r)).toContain('面：一致 2');
  });
});

describe('群系色核对', () => {
  const 手写: 群系表 = {
    群系: {
      'minecraft:plains': { 草: '#91bd59', 叶: '#77ab2f', 水: '#3f76e4' },
      'minecraft:swamp': { 草: '#6a7039', 叶: '#6a7039', 水: '#617b64', 草修饰: 'swamp' },
      'old:only': { 草: '#000000', 叶: '#000000', 水: '#000000' },
    },
  };
  const 导出: 群系表 = {
    采样点: [[0, 0], [100, 100]],
    群系: {
      'minecraft:plains': { 草: '#91bd59', 叶: '#77ab2f', 水: '#3f76e4' },
      'minecraft:swamp': { 草: '#6a7039', 叶: '#6a7039', 水: '#617b64', 草修饰: 'swamp', 采样: { 草: ['#4c763c', '#6a7039'] } },
      'new:only': { 草: '#111111', 叶: '#111111', 水: '#111111' },
    },
  };
  it('定值、修饰、只在一边', () => {
    const r = 核对群系(导出, 手写);
    expect(r.只在导出).toEqual(['new:only']);
    expect(r.只在手写).toEqual(['old:only']);
    expect(r.定值不同).toEqual([]);
    expect(r.修饰不同).toEqual([]);
  });
  it('现行规则在采样点上和游戏比', () => {
    const 规则 = { 草: (b: string, x: number) => (b === 'minecraft:swamp' && x === 0 ? 0x4c763c : b === 'minecraft:swamp' ? 0x000001 : 0x91bd59), 叶: (b: string) => (b === 'minecraft:swamp' ? 0x6a7039 : 0x77ab2f), 水: (b: string) => (b === 'minecraft:swamp' ? 0x617b64 : 0x3f76e4) };
    const r = 核对群系(导出, 手写, 规则);
    expect(r.规则核对).toEqual([{ 群系: 'minecraft:swamp', 项: '草', 点数: 2, 不同: 1, 例: [{ x: 100, z: 100, 规则: '#000001', 游戏: '#6a7039' }] }]);
  });
});
