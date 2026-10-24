import { describe, expect, it } from 'vitest';
import { 分屏门在, 半屏取景, 取景, 地面线离底, 整屏取景, 整屏镜头, 整屏镜头N, 树顶屏, 正交顶面, 每格, 像素N, 默认天弧 } from './场/2-门口/参数.ts';
import { 天亮, 天体位置, 天球角, 月相 } from './地点/天体.ts';
import { 侧机位, 侧投影 } from './地点/侧剖面.tsx';
import { 樱花树方块, 樱花树阶段 } from './地点/樱花树.ts';

const 门口箱子右 = 2; // 地点/门口小木屋.tsx 门口.站位.箱子右（那边是 tsx，测试不引）

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

  it('默认天弧：正午太阳（2 格见方）不出画面顶边，早晚不出左右边', () => {
    for (const N of [6, 8]) {
      const 取 = 整屏取景(N);
      const 弧 = 默认天弧(取, 1280, 720);
      const 顶 = 取.中心[1] + 720 / 取.每格;
      const 半宽 = 1280 / 取.每格;
      expect(天体位置(6000, 弧).太阳.z + 1).toBeLessThan(顶);
      expect(Math.abs(天体位置(0, 弧).太阳.x) + 1).toBeLessThan(半宽);
    }
  });
});

describe('樱花树：进度 → 五截', () => {
  it('0 是树苗，每 1/5 长一截，1 是整棵', () => {
    expect([0, 0.19, 0.2, 0.4, 0.6, 0.8, 0.99, 1].map(樱花树阶段)).toEqual([0, 0, 1, 2, 3, 4, 4, 5]);
  });

  it('一截比一截高，整棵树顶 9 格（比屋脊 6.5 格高），格子不重复', () => {
    const 顶 = (s: number) => Math.max(...樱花树方块(s, [-5, 1, 0]).map((b) => b.位[2] + 1));
    expect([1, 2, 3, 4, 5].map(顶)).toEqual([3, 4, 5, 7, 9]);
    for (let s = 0; s <= 5; s++) {
      const 格 = 樱花树方块(s, [-5, 1, 0]).map((b) => b.位.join(','));
      expect(new Set(格).size).toBe(格.length);
    }
    expect(樱花树方块(0, [-5, 1, 0])).toEqual([{ 状态: 'minecraft:cherry_sapling', 位: [-5, 1, 0] }]);
  });

  it('前四截叶子少，第 5 截叶子多出一大截、地上有花簇', () => {
    const 叶 = (s: number) => 樱花树方块(s, [-5, 1, 0]).filter((b) => b.状态 === 'minecraft:cherry_leaves').length;
    expect(叶(5)).toBeGreaterThan(2.5 * 叶(4));
    expect(樱花树方块(5, [-5, 1, 0]).some((b) => b.状态.startsWith('minecraft:pink_petals'))).toBe(true);
    expect(樱花树方块(4, [-5, 1, 0]).some((b) => b.状态.startsWith('minecraft:pink_petals'))).toBe(false);
  });
});

describe('门口取景：贴图像素落在整像素上', () => {
  it('N 是偶数，地面线、门边落在偶数像素（预览级 1280×720 也对齐）', () => {
    expect(像素N % 2).toBe(0);
    expect(每格).toBe(16 * 像素N);
    expect(取景.中心[1] * 每格).toBe(1440 / 2 - 地面线离底());
    expect(地面线离底()).toBe(300);
    expect([6, 8, 10].map((N) => 地面线离底(N) % 2)).toEqual([0, 0, 0]);
    expect(() => 整屏取景(7)).toThrow();
    const h = 半屏取景(1280, 分屏门在);
    expect(Math.abs(h.中心[0] * 每格 - Math.round(h.中心[0] * 每格))).toBeLessThan(1e-9);
    expect(Math.abs(Math.round(h.中心[0] * 每格)) % 2).toBe(0);
    expect(() => 半屏取景(1280, 0.7001)).toThrow();
    expect(() => 半屏取景(1280, 0.5 + 1 / 1280)).toThrow();
  });

  it('长成的树冠（x −9.5～−1.5，斜投影里的树顶）和整间屋（到屋檐 8.5）在 N = 6、8 的整屏里；N = 6 分屏右边看得到整个树冠和箱子右边站的人', () => {
    for (const N of [6, 8]) {
      const 取 = 整屏取景(N);
      const 半宽 = 1280 / 取.每格;
      expect(-9.5).toBeGreaterThanOrEqual(取.中心[0] - 半宽);
      expect(8.5).toBeLessThanOrEqual(取.中心[0] + 半宽);
      expect(树顶屏(N)).toBeLessThanOrEqual(取.中心[1] + 720 / 取.每格);
    }
    const h = 半屏取景(1280, 分屏门在);
    expect(-9.5).toBeGreaterThanOrEqual(h.中心[0] - 640 / 每格);
    expect(门口箱子右).toBeLessThanOrEqual(h.中心[0] + 640 / 每格 - 0.5);
  });
});

describe('门这个机位的整屏镜头（第 8、9、10 句，第 15 句开头）', () => {
  it('N = 10；门在画面正中，地面线离底 1.5 格、落在偶数成片像素上；描边一个贴图像素宽', () => {
    expect(整屏镜头N).toBe(10);
    const 取 = 整屏镜头.取景;
    expect(取.每格).toBe(16 * 整屏镜头N);
    const 投 = 侧投影(取, 1280, 720);
    expect(投(0, 0).x).toBe(640);
    const 离底 = (720 - 投(0, 0).y) * 2;
    expect(离底).toBe(240);
    expect(离底 % 2).toBe(0);
    expect(整屏镜头.描边宽).toBe(整屏镜头N);
    expect(像素N).toBe(6); // 核对-门口 还是 6（分屏现在是 N = 8，见 场/2-门口/分屏参数.ts）
  });

  it('屋脊（斜投影里往里 3 格的屋顶）还在画里，屋子西边的屋檐也在', () => {
    const 取 = 整屏镜头.取景;
    const 顶 = 取.中心[1] + 720 / 取.每格;
    expect(6.5 + (3 * 正交顶面) / 整屏镜头N).toBeLessThan(顶);
    expect(-1.5).toBeGreaterThan(取.中心[0] - 1280 / 取.每格);
  });
});

describe('侧剖面机位：看点在剖面上，斜投影往里抬', () => {
  it('门洞中心的地面落在画面正中往下 地面线离底 处；往里 3 格抬 3 × 顶面 ÷ N 格', () => {
    const 投 = 侧投影(取景, 1280, 720, 2);
    expect(投(0, 0)).toEqual({ x: 640, y: 720 - 地面线离底() / 2 });
    expect(投(0, 0).y - 投(0, 0, 3).y).toBeCloseTo((3 * 2 / 像素N) * 每格 / 2, 9);
    expect(侧机位(取景, 2)).toEqual({ 种: '正交', N: 像素N, 顶面: 2, 看: [0, 0, 取景.中心[1]], 朝: '北' });
  });
});
