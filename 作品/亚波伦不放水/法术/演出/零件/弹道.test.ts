import { describe, expect, it } from 'vitest';
import { 命中刻, 弹道位置, 抛到, 抛物线, 朝向角, 火球道, 直线, 追踪, 长, 减 } from './弹道.ts';

describe('弹道', () => {
  it('火球道：稳态速度 = 加速 × 惯性 ÷ (1 − 惯性)', () => {
    const 道 = 火球道([0, 0, 0], [1, 0, 0], { 惯性: 0.82 });
    expect(道(0)).toEqual([0, 0, 0]);
    expect(道(1)[0]).toBeCloseTo(0, 9); // 出生那一刻速度是 0
    expect(道(2)[0]).toBeCloseTo(0.082, 9);
    expect(道(61)[0] - 道(60)[0]).toBeCloseTo((0.1 * 0.82) / 0.18, 4);
  });
  it('抛到：按给的刻数正好落在目标', () => {
    const 起 = [0, 0, 5] as const;
    const 目标 = [12, -3, 0] as const;
    const 道 = 抛物线(起, 抛到(起, 目标, 30));
    expect(长(减(道(30), 目标))).toBeLessThan(1e-9);
  });
  it('插值和命中刻', () => {
    const 道 = 直线([0, 0, 0], [1, 0, 0]);
    expect(弹道位置(道, 2.5)[0]).toBeCloseTo(2.5);
    expect(命中刻(道, [10, 0, 0], 0.5)).toBeCloseTo(9.5);
    expect(命中刻(道, [10, 5, 0], 0.5)).toBeNull();
  });
  it('追踪：拐过去能打到侧面的目标', () => {
    const 道 = 追踪([0, 0, 0], [0.5, 0, 0], [5, 5, 0], 0.2);
    expect(命中刻(道, [5, 5, 0], 0.5)).not.toBeNull();
  });
  it('朝向角：朝北（MC 的 −z）是 yaw 180，朝上是 pitch −90', () => {
    expect(Math.abs(朝向角([0, 1, 0]).yaw)).toBeCloseTo(180);
    expect(朝向角([1, 0, 0]).yaw).toBeCloseTo(-90);
    expect(朝向角([0, 0, 1]).pitch).toBeCloseTo(-90);
  });
});
