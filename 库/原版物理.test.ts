// 原版下落正本：和 6-3-2 的 fallTime、2-末地 的 原版下落、2-第一晚 的 下落 和 按刻取 对。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFunction } from '../pipeline/检查/副本识别.ts';
import { vanillaMotion, fallOneTick, fallTable, fallHeightAtTick, sampleByTick, itemFallOptions, landTick } from './原版物理.ts';

const root = path.resolve(import.meta.dirname, '..');
const copyFn = (file: string, fnName: string, extra?: Record<string, unknown>) =>
  getFunction(file, fs.readFileSync(path.join(root, file), 'utf8'), fnName, { allowLoop: true, extra }) as (...a: never[]) => unknown;
const fallHeights = [0.3, 1, 2.5, 5, 23, 80];

describe('原版下落正本', () => {
  it('前几刻：0、0、−0.0784、−0.233632……（先挪再改速度）；站着的竖直速度是 −0.0784', () => {
    expect(vanillaMotion.standingVertSpeed).toBeCloseTo(-0.0784, 12);
    let s = { 高: 0, 速: 0 };
    const heights = [0];
    for (let i = 0; i < 4; i++) heights.push((s = fallOneTick(s.高, s.速)).高);
    expect(heights.map((x) => +x.toFixed(6))).toEqual([0, 0, -0.0784, -0.233632, -0.464159]);
    expect(fallHeightAtTick(2)).toBeCloseTo(-0.0784, 12);
    expect(fallHeightAtTick(2.5)).toBeCloseTo((-0.0784 - 0.233632) / 2, 9);
    expect(fallHeightAtTick(-1)).toBe(0);
  });
  it('终端速度约 3.92 格/刻；物品重力减半', () => {
    const vSpeed = fallHeightAtTick(400) - fallHeightAtTick(399);
    expect(vSpeed).toBeCloseTo(-3.92, 2);
    expect(fallHeightAtTick(400, { 重力: vanillaMotion.itemGravity }) - fallHeightAtTick(399, { 重力: vanillaMotion.itemGravity })).toBeCloseTo(-1.96, 2);
  });
  it('物品、下落方块先加重力再挪：第一刻就掉 0.04，往后 −0.04 − 0.0792……', () => {
    let s = { 高: 0, 速: 0 };
    const heights = [0];
    for (let i = 0; i < 3; i++) heights.push((s = fallOneTick(s.高, s.速, vanillaMotion.itemGravity, vanillaMotion.verticalDrag, true)).高);
    expect(heights.map((x) => +x.toFixed(6))).toEqual([0, -0.04, -0.1192, -0.236816]);
    expect(fallHeightAtTick(2, itemFallOptions)).toBeCloseTo(-0.1192, 12);
    expect(fallHeightAtTick(1.5, { ...itemFallOptions, initSpeed: 0.2 })).toBeCloseTo(0.16 + 0.5 * (0.16 * 0.98 - 0.04), 12);
    expect(fallTable(1, itemFallOptions).at(-1)).toBe(-1);
    expect(fallHeightAtTick(landTick(3, itemFallOptions), itemFallOptions)).toBeCloseTo(-3, 9);
  });
  it('下落表 末项正好 −落差，落地刻 落在表的最后一段里', () => {
    for (const h of fallHeights) {
      const curveTable = fallTable(h);
      expect(curveTable.at(-1)).toBe(-h);
      const k = landTick(h);
      expect(k).toBeGreaterThan(curveTable.length - 3);
      expect(k).toBeLessThanOrEqual(curveTable.length - 1);
      expect(fallHeightAtTick(k)).toBeCloseTo(-h, 9);
    }
    expect(fallTable(0)).toEqual([0]);
    expect(landTick(0)).toBe(0);
  });
  it('按刻取：刻间线性、两头停住', () => {
    expect(sampleByTick([0, -1, -3], 1.5)).toBe(-2);
    expect(sampleByTick([0, -1, -3], -2)).toBe(0);
    expect(sampleByTick([0, -1, -3], 9)).toBe(-3);
    expect(() => sampleByTick([], 0)).toThrow();
  });
});

describe('原版下落正本和旧副本对得上', () => {
  it('6-3-2 的 fallTime（秒）= 落地刻 / 20', () => {
    const fallTime = copyFn('作品/应力转动/地点/边城/6-3-2/编排.ts', 'fallTime') as (h: number) => number;
    for (const h of fallHeights) expect(fallTime(h)).toBeCloseTo(landTick(h) / 20, 12);
  });
  it('2-末地 的 原版下落（掉了多少格）= −下落高度', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/场/2-末地/编排.ts', '原版下落') as (k: number) => number;
    for (const k of [-1, 0, 0.5, 1, 2.25, 7, 19.9, 60]) expect(legacyFn(k)).toBeCloseTo(-fallHeightAtTick(k), 12);
  });
  it('2-第一晚 的 下落（默认从站着的速度开始）和 按刻取', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/段/2-第一晚/编排.ts', '下落', { standingVelY: vanillaMotion.standingVertSpeed }) as (h: number, v?: number) => number[];
    for (const h of fallHeights) {
      expect(legacyFn(h)).toEqual(fallTable(h, { initSpeed: vanillaMotion.standingVertSpeed }));
      expect(legacyFn(h, 0)).toEqual(fallTable(h));
    }
    const legacyLookup = copyFn('作品/把回忆拼好给你/段/2-第一晚/编排.ts', '按刻取') as (curveTable: number[], k: number) => number;
    const curveTable = fallTable(5);
    for (const k of [-1, 0, 0.5, 3.3, 7, 100]) expect(legacyLookup(curveTable, k)).toBeCloseTo(sampleByTick(curveTable, k), 12);
  });
});
