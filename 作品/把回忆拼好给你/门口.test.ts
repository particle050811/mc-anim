import { describe, expect, it } from 'vitest';
import { 半屏取景, 取景, 每格 } from './场/2-门口/参数.ts';
import { 天亮, 天体位置, 天球角, 月相 } from './地点/天体.ts';
import { 樱花树方块, 樱花树阶段 } from './地点/樱花树.ts';

describe('天体：照原版 timeOfDay', () => {
  it('正午太阳在头顶，日出在东（右）、日落在西（左），月亮在对面', () => {
    const 弧 = { 心: [0, 0] as const, 半径: 6 };
    const 午 = 天体位置(6000, 弧);
    expect(天球角(6000)).toBeCloseTo(0, 6);
    expect(午.太阳.x).toBeCloseTo(0, 6);
    expect(午.太阳.z).toBeCloseTo(6, 6);
    expect(午.月亮.z).toBeCloseTo(-6, 6);
    const 晨 = 天体位置(0, 弧);
    expect(晨.太阳.x).toBeGreaterThan(5);
    expect(晨.太阳.高).toBeGreaterThan(0);
    const 暮 = 天体位置(12000, 弧);
    expect(暮.太阳.x).toBeLessThan(-5);
    expect(天体位置(18000, 弧).月亮.z).toBeCloseTo(6, 6);
  });

  it('天亮：正午 1、午夜 0；月相每天换一格、8 天一轮', () => {
    expect(天亮(6000)).toBe(1);
    expect(天亮(18000)).toBe(0);
    expect([0, 24000, 48000, 7 * 24000, 8 * 24000].map(月相)).toEqual([0, 1, 2, 7, 0]);
  });
});

describe('樱花树：进度 → 五截', () => {
  it('0 是树苗，每 1/5 长一截，1 是整棵', () => {
    expect([0, 0.19, 0.2, 0.4, 0.6, 0.8, 0.99, 1].map(樱花树阶段)).toEqual([0, 0, 1, 2, 3, 4, 4, 5]);
  });

  it('一截比一截高，整棵树顶 7 格（比屋脊 5.5 格高），格子不重复', () => {
    const 顶 = (s: number) => Math.max(...樱花树方块(s, [-4, 1, 0]).map((b) => b.位[2] + 1));
    expect([1, 2, 3, 4, 5].map(顶)).toEqual([3, 4, 5, 6, 7]);
    for (let s = 0; s <= 5; s++) {
      const 格 = 樱花树方块(s, [-4, 1, 0]).map((b) => b.位.join(','));
      expect(new Set(格).size).toBe(格.length);
    }
    expect(樱花树方块(0, [-4, 1, 0])).toEqual([{ 状态: 'minecraft:cherry_sapling', 位: [-4, 1, 0] }]);
  });
});

describe('门口取景：贴图像素落在整像素上', () => {
  it('一个贴图像素是整数像素，地面线、门边落在整像素', () => {
    expect(每格 % 16).toBe(0);
    expect((取景.中心[1] * 每格) % 1).toBeCloseTo(0, 9);
    const h = 半屏取景(1280, 0.7);
    expect(Math.abs(h.中心[0] * 每格 - Math.round(h.中心[0] * 每格))).toBeLessThan(1e-9);
    expect(() => 半屏取景(1280, 0.7001)).toThrow();
  });
});
