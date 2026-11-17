// 原版下落正本自身的取值（和 6-3-2 的 fallTime、2-末地 的 原版下落、2-第一晚 的 下落 和 按刻取 对的在 pipeline/检查/副本对照/原版物理.test.ts）。
import { describe, expect, it } from 'vitest';
import { vanillaMotion, fallOneTick, fallTable, fallHeightAtTick, sampleByTick, itemFallOptions, landTick } from './原版物理.ts';

const fallHeights = [0.3, 1, 2.5, 5, 23, 80];

describe('原版下落正本', () => {
  it('前几刻：0、0、−0.0784、−0.233632……（先挪再改速度）；站着的竖直速度是 −0.0784', () => {
    expect(vanillaMotion.standingVertSpeed).toBeCloseTo(-0.0784, 12);
    let s = { height: 0, 速: 0 };
    const heights = [0];
    for (let i = 0; i < 4; i++) heights.push((s = fallOneTick(s.height, s.速)).height);
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
    let s = { height: 0, 速: 0 };
    const heights = [0];
    for (let i = 0; i < 3; i++) heights.push((s = fallOneTick(s.height, s.速, vanillaMotion.itemGravity, vanillaMotion.verticalDrag, true)).height);
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
