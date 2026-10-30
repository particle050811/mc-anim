import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decode } from 'fast-png';
import { afterAll, describe, expect, it } from 'vitest';
import { 区域源 } from '../区域源.ts';
import { 造世界 } from '../测试夹具.ts';
import { 画高度 } from './出图.ts';
import { 坐标图, 比例, 网格间距 } from './图.ts';
import { 列中, 存档方块源, 规范范围 } from './源.ts';

const 临时 = fs.mkdtempSync(path.join(os.tmpdir(), '世界-查询-'));
afterAll(() => fs.rmSync(临时, { recursive: true, force: true }));

// 一个区块：x < 8 的地面高 60，其余 50；(3, 61, 3) 一根原木
const dir = path.join(临时, '世界');
造世界(dir, 1n, [[0, 0, (x, y, z) => (x === 3 && z === 3 && y === 61 ? 'minecraft:oak_log[axis=y]' : y <= (x < 8 ? 60 : 50) ? 'minecraft:stone' : 'minecraft:air')]], { y底: 0, 段数: 5 });

describe('存档方块源', () => {
  const 源 = new 存档方块源(new 区域源(path.join(dir, 'region'), '1', null), '测试');
  源.载入(规范范围(0, 0, 15, 15));

  it('列从上往下盖满整列、顶是最高的非空气方块', () => {
    const c = 源.列(3, 3)!;
    expect(c.段[0]!.顶).toBe(79);
    expect(c.段.at(-1)!.底).toBe(0);
    expect(列中(c, 61)!.状态).toBe('minecraft:oak_log[axis=y]');
    expect(源.顶(3, 3)).toEqual({ y: 61, 状态: 'minecraft:oak_log[axis=y]', 群系: 'minecraft:plains' });
    expect(源.顶(10, 3)!.y).toBe(50);
    expect(源.列(40, 3)).toBeNull();
  });

  it('高度图：表和图都对，没数据的格空着', () => {
    const g = 画高度(源, 规范范围(0, 0, 19, 3));
    expect(g.表[0]!.slice(0, 4)).toEqual([60, 60, 60, 60]);
    expect(g.表[3]![3]).toBe(61);
    expect(g.表[0]![12]).toBe(50);
    expect(g.表[0]![16]).toBeNull();
    expect(g.最低).toBe(50);
    expect(g.最高).toBe(61);
    const img = decode(g.png);
    expect([img.width, img.height]).toEqual([g.宽, g.高]);
  });
});

describe('出图的比例和网格', () => {
  it('小范围放大、大范围隔格取', () => {
    expect(比例(100)).toEqual({ 像素: 10, 步: 1 });
    expect(比例(5000)).toEqual({ 像素: 1, 步: 3 });
    expect(网格间距(10)).toBe(8);
    expect(网格间距(0.5)).toBe(128);
  });
  it('坐标图留出刻度边', () => {
    const t = new 坐标图({ 列: 10, 行: 5, 像素: 2, 步: 1, 横起: 0, 竖起: 0, 竖向: 1, 横名: 'x', 竖名: 'z' });
    t.格(0, 0, [255, 0, 0]);
    t.网格();
    const o = ((t.上 + 1) * t.布.宽 + t.左 + 1) * 3; // 第 0 行、第 0 列压着网格线，取格里另一个像素
    expect([...t.布.像素.subarray(o, o + 3)]).toEqual([255, 0, 0]);
    expect(t.布.宽).toBe(t.左 + 20 + 8);
  });
});
