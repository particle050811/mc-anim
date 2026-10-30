import { describe, expect, it } from 'vitest';
import { catmullRom, 缓动, 缓动名们, 贝塞尔, 阶跃 } from './插值.ts';

describe('插值', () => {
  it('linear、catmullrom 过端点', () => {
    expect(catmullRom(0, 9, 1, 5, -3)).toBe(1);
    expect(catmullRom(1, 9, 1, 5, -3)).toBe(5);
    // 等距直线上的 catmullrom 退化成线性
    expect(catmullRom(0.3, 0, 1, 2, 3)).toBeCloseTo(1.3, 12);
  });

  it('catmullrom 在「闭、闭」之间冲过头（魔法酒狐眼皮的坑）', () => {
    expect(catmullRom(0.5, 1, 0, 0, 1)).toBeCloseTo(-0.125, 12);
  });

  it('step：不给步数停在起点，给步数分级', () => {
    expect(阶跃(0.99)).toBe(0);
    expect(阶跃(1)).toBe(1);
    expect(阶跃(0.6, 4)).toBe(0.5);
  });

  it('缓动：两端固定、对称、名字都认识', () => {
    for (const 名 of 缓动名们) {
      if (名 === 'step') continue;
      expect(缓动(名, 0)).toBeCloseTo(0, 9);
      expect(缓动(名, 1)).toBeCloseTo(1, 9);
    }
    expect(缓动('easeInQuad', 0.5)).toBe(0.25);
    expect(缓动('easeOutQuad', 0.5)).toBe(0.75);
    expect(缓动('easeInOutCubic', 0.5)).toBeCloseTo(0.5, 12);
    expect(缓动('easeInBack', 0.5)).toBeLessThan(0);
    expect(缓动('不认识的', 0.3)).toBe(0.3);
  });

  it('bezier：手柄平放时两端切线水平，中点对称', () => {
    const 起 = { t: 0, v: 0, 右手柄: [0.5, 0] as [number, number] };
    const 终 = { t: 1, v: 1, 左手柄: [-0.5, 0] as [number, number] };
    expect(贝塞尔(0.5, 起, 终)).toBeCloseTo(0.5, 9);
    expect(贝塞尔(0.1, 起, 终)).toBeLessThan(0.1);
    expect(贝塞尔(0.9, 起, 终)).toBeGreaterThan(0.9);
    // 手柄沿直线时就是线性
    expect(贝塞尔(0.3, { t: 0, v: 0, 右手柄: [1 / 3, 1 / 3] }, { t: 1, v: 1, 左手柄: [-1 / 3, -1 / 3] })).toBeCloseTo(0.3, 9);
  });
});
