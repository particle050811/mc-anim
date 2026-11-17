// 原版下落正本和旧副本对：6-3-2 的 fallTime、2-末地 的 原版下落、2-第一晚 的 下落 和 按刻取（副本从源码里单独取出来编，副本识别.ts）。正本自身的测试在 库/原版物理.test.ts。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFunction } from '../副本识别.ts';
import { lerp } from '../../../engine/core/数学.ts';
import { vanillaMotion, fallTable, fallHeightAtTick, sampleByTick, landTick, ticksPerSec } from '../../../库/原版物理.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const copyFn = (file: string, fnName: string, extra?: Record<string, unknown>) =>
  getFunction(file, fs.readFileSync(path.join(root, file), 'utf8'), fnName, { allowLoop: true, extra }) as (...a: never[]) => unknown;
const fallHeights = [0.3, 1, 2.5, 5, 23, 80];

describe('原版下落正本和旧副本对得上', () => {
  it('6-3-2 的 fallTime（秒）= 落地刻 / 20', () => {
    const fallTime = copyFn('作品/应力转动/地点/边城/6-3-2/编排.ts', 'fallTime', { tickSec: 1 / ticksPerSec }) as (h: number) => number;
    for (const h of fallHeights) expect(fallTime(h)).toBeCloseTo(landTick(h) / 20, 12);
  });
  it('2-末地 的 原版下落（掉了多少格）= −下落高度', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/场/2-末地/编排.ts', 'vanillaFall') as (k: number) => number;
    for (const k of [-1, 0, 0.5, 1, 2.25, 7, 19.9, 60]) expect(legacyFn(k)).toBeCloseTo(-fallHeightAtTick(k), 12);
  });
  it('2-第一晚 的 下落（默认从站着的速度开始）和 按刻取', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/段/2-第一晚/编排.ts', 'dropPath', { standingVelY: vanillaMotion.standingVertSpeed }) as (h: number, v?: number) => number[];
    for (const h of fallHeights) {
      expect(legacyFn(h)).toEqual(fallTable(h, { initSpeed: vanillaMotion.standingVertSpeed }));
      expect(legacyFn(h, 0)).toEqual(fallTable(h));
    }
    const legacyLookup = copyFn('作品/把回忆拼好给你/段/2-第一晚/编排.ts', 'sampleByTick', { lerp }) as (curveTable: number[], k: number) => number;
    const curveTable = fallTable(5);
    for (const k of [-1, 0, 0.5, 3.3, 7, 100]) expect(legacyLookup(curveTable, k)).toBeCloseTo(sampleByTick(curveTable, k), 12);
  });
});
