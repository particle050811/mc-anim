import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decode } from 'fast-png';
import { afterAll, describe, expect, it } from 'vitest';
import { RegionSource } from '../区域源.ts';
import { makeWorld } from '../测试夹具.ts';
import { drawHeight } from './出图.ts';
import { CoordChart, ratioFor, gridSpacing } from './图.ts';
import { segmentAt, SaveBlockSource, normalizeRange } from './源.ts';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '世界-查询-'));
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

// 一个区块：x < 8 的地面高 60，其余 50；(3, 61, 3) 一根原木
const dir = path.join(tempDir, '世界');
makeWorld(dir, 1n, [[0, 0, (x, y, z) => (x === 3 && z === 3 && y === 61 ? 'minecraft:oak_log[axis=y]' : y <= (x < 8 ? 60 : 50) ? 'minecraft:stone' : 'minecraft:air')]], { yBottom: 0, 段数: 5 });

describe('存档方块源', () => {
  const blockSource = new SaveBlockSource(new RegionSource(path.join(dir, 'region'), '1', null), '测试');
  blockSource.load(normalizeRange(0, 0, 15, 15));

  it('列从上往下盖满整列、顶是最高的非空气方块', () => {
    const c = blockSource.列(3, 3)!;
    expect(c.段[0]!.topY).toBe(79);
    expect(c.段.at(-1)!.bottom).toBe(0);
    expect(segmentAt(c, 61)!.状态).toBe('minecraft:oak_log[axis=y]');
    expect(blockSource.topBlockAt(3, 3)).toEqual({ y: 61, 状态: 'minecraft:oak_log[axis=y]', 群系: 'minecraft:plains' });
    expect(blockSource.topBlockAt(10, 3)!.y).toBe(50);
    expect(blockSource.列(40, 3)).toBeNull();
  });

  it('高度图：表和图都对，没数据的格空着', () => {
    const g = drawHeight(blockSource, normalizeRange(0, 0, 19, 3));
    expect(g.表[0]!.slice(0, 4)).toEqual([60, 60, 60, 60]);
    expect(g.表[3]![3]).toBe(61);
    expect(g.表[0]![12]).toBe(50);
    expect(g.表[0]![16]).toBeNull();
    expect(g.minY).toBe(50);
    expect(g.maxY).toBe(61);
    const img = decode(g.png);
    expect([img.width, img.height]).toEqual([g.宽, g.高]);
  });
});

describe('出图的比例和网格', () => {
  it('小范围放大、大范围隔格取', () => {
    expect(ratioFor(100)).toEqual({ pixel: 10, 步: 1 });
    expect(ratioFor(5000)).toEqual({ pixel: 1, 步: 3 });
    expect(gridSpacing(10)).toBe(8);
    expect(gridSpacing(0.5)).toBe(128);
  });
  it('坐标图留出刻度边', () => {
    const t = new CoordChart({ 列: 10, 行: 5, pixel: 2, 步: 1, horizStart: 0, vertStart: 0, vertDir: 1, horizontalLabel: 'x', verticalLabel: 'z' });
    t.格(0, 0, [255, 0, 0]);
    t.网格();
    const o = ((t.上 + 1) * t.canvas.宽 + t.left + 1) * 3; // 第 0 行、第 0 列压着网格线，取格里另一个像素
    expect([...t.canvas.pixels.subarray(o, o + 3)]).toEqual([255, 0, 0]);
    expect(t.canvas.宽).toBe(t.left + 20 + 8);
  });
});
