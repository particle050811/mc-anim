import { describe, expect, it } from 'vitest';
import { catmullRom, applyEasing, easingNames, bezier, step } from './插值.ts';

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
    expect(step(0.99)).toBe(0);
    expect(step(1)).toBe(1);
    expect(step(0.6, 4)).toBe(0.5);
  });

  it('缓动：两端是 0、1（Expo、Bounce 除外）、名字都认识、不分大小写', () => {
    for (const easingName of easingNames) {
      // Expo 0 处是 2^−10；Bounce 的四段抛物线在端点差 1e-7 不正好过 0、1（float 常数）。段末 GeckoLib 4 直接取终点值，1 处看不出来
      if (['step', 'catmullrom'].includes(easingName) || /Expo$|Bounce$/.test(easingName)) continue;
      expect(applyEasing(easingName, 0)).toBeCloseTo(0, 9);
      expect(applyEasing(easingName, 1)).toBeCloseTo(1, 9);
    }
    expect(applyEasing('easeInQuad', 0.5)).toBe(0.25);
    expect(applyEasing('easeoutquad', 0.5)).toBe(0.75);
    expect(applyEasing('EASEINOUTCUBIC', 0.5)).toBeCloseTo(0.5, 12);
    expect(applyEasing('easeInBack', 0.5)).toBeLessThan(0);
    expect(applyEasing('不认识的', 0.3)).toBe(0.3);
  });

  // 下面的期望值照 GeckoLib 4.8.4 EasingType.java 手算；Penner（easings.net）公式会得到注释里的另一个数，所以这组能分出两种口径
  it('缓动按 GeckoLib 4 的公式，不是 Penner 的', () => {
    // easeInQuint 注册成 pow(4)：0.5⁴ = 0.0625（Penner 0.03125）
    expect(applyEasing('easeInQuint', 0.5)).toBe(0.0625);
    expect(applyEasing('easeOutQuint', 0.5)).toBe(1 - 0.5 ** 5);
    // Expo 0 处 2^−10（Penner 特判成 0）
    expect(applyEasing('easeInExpo', 0)).toBe(2 ** -10);
    // Elastic：1 − cos³(π/4)·cos(π/2) = 1（Penner 的 easeInElastic(0.5) ≈ −0.0156）
    expect(applyEasing('easeInElastic', 0.5)).toBeCloseTo(1, 12);
    expect(applyEasing('easeInElastic', 0.25)).toBeCloseTo(1 - Math.cos(Math.PI / 8) ** 3 * Math.cos(Math.PI / 4), 12);
    // Bounce：参数 = 弹性（默认 0.5），四段抛物线取最小
    const bounceEase = (x: number, n = 0.5) =>
      Math.min((121 / 16) * x * x, (121 / 4) * n * (x - Math.fround(6 / 11)) ** 2 + 1 - n, 121 * n * n * (x - Math.fround(9 / 11)) ** 2 + 1 - n * n,
        484 * n ** 3 * (x - Math.fround(10.5 / 11)) ** 2 + 1 - n ** 3);
    // 注意 GeckoLib 4 的 bounce 本身就是「出」的形状，easeIn 直接用它、easeOut 反过来，和 Penner 正好相反
    expect(applyEasing('easeInBounce', 0.3)).toBeCloseTo(bounceEase(0.3), 12);
    expect(applyEasing('easeOutBounce', 0.3)).toBeCloseTo(1 - bounceEase(0.7), 12);
    expect(applyEasing('easeInBounce', 0.3, [0.8])).toBeCloseTo(bounceEase(0.3, 0.8), 12);
    expect(applyEasing('easeInBounce', 0.3)).not.toBeCloseTo(1 - (7.5625 * 0.7 * 0.7 - 7.5625 * 2 * (1.5 / 2.75) * 0.7 + 7.5625 * (1.5 / 2.75) ** 2 + 0.75), 3); // Penner 的 easeInBounce(0.3)
    // Back 的参数是倍数：2 倍 → 回弹量 3.40316（Penner 当成回弹量本身）
    const s = 2 * 1.70158;
    expect(applyEasing('easeInBack', 0.4, [2])).toBeCloseTo(0.16 * ((s + 1) * 0.4 - s), 12);
    // step 默认 2 级、只到 0.5；给级数按级数
    expect(applyEasing('step', 0.49)).toBe(0);
    expect(applyEasing('step', 0.99)).toBe(0.5);
    expect(applyEasing('step', 0.6, [4])).toBe(0.5);
    expect(applyEasing('step', 0.8, [4])).toBe(0.75);
    expect(() => applyEasing('step', 0.5, [1])).toThrow();
  });

  it('bezier：手柄平放时两端切线水平，中点对称', () => {
    const startKey = { t: 0, v: 0, rightHandle: [0.5, 0] as [number, number] };
    const endKey = { t: 1, v: 1, leftHandle: [-0.5, 0] as [number, number] };
    expect(bezier(0.5, startKey, endKey)).toBeCloseTo(0.5, 9);
    expect(bezier(0.1, startKey, endKey)).toBeLessThan(0.1);
    expect(bezier(0.9, startKey, endKey)).toBeGreaterThan(0.9);
    // 手柄沿直线时就是线性
    expect(bezier(0.3, { t: 0, v: 0, rightHandle: [1 / 3, 1 / 3] }, { t: 1, v: 1, leftHandle: [-1 / 3, -1 / 3] })).toBeCloseTo(0.3, 9);
  });
});
