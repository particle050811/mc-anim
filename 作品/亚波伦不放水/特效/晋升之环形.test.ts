// 晋升之环的形：原版的转速和摆法照游戏的数，候选的方盒都在写明的外径里、各层按秒转。
import { describe, expect, it } from 'vitest';
import { 候选们, 原版环, 原版转角, 戴法 } from './晋升之环形.ts';

describe('原版贴片', () => {
  it('每秒 18 度，从正面看顺时针', () => {
    expect(原版转角(0)).toBeCloseTo(0);
    expect(原版转角(1)).toBe(-18);
    expect(原版转角(20)).toBe(-360);
  });
  it('史蒂夫戴原版就是游戏的数：头的转轴上方 12 像素、往后 5 像素、前倾 45 度、16 像素见方', () => {
    expect(戴法.史蒂夫.原版).toEqual({ 位: [0, 12, -5], 前倾度: 45, 倍: 1 });
    expect(原版环.边长).toBe(16);
  });
});

describe('候选', () => {
  for (const [名, 候选] of Object.entries(候选们)) {
    it(`${名}：方盒尺寸为正，转到任何时刻都不超出外径`, () => {
      for (const 秒 of [0, 0.7, 3.3]) {
        let 最远 = 0;
        for (const 层 of 候选.层们) {
          const p = 层.位姿(秒);
          const 心 = Math.hypot(p.中心?.[0] ?? 0, p.中心?.[1] ?? 0);
          for (const b of 层.盒们) {
            for (const i of [0, 1, 2] as const) expect(b.大[i]).toBeGreaterThan(b.小[i]);
            // 自转会把盒子的任何一角转到朝外：按离层中心最远的角算
            const 角远 = Math.hypot(Math.max(Math.abs(b.小[0]), Math.abs(b.大[0])), Math.max(Math.abs(b.小[1]), Math.abs(b.大[1])), p.自转 ? Math.max(Math.abs(b.小[2]), Math.abs(b.大[2])) : 0);
            最远 = Math.max(最远, 心 + 角远);
          }
        }
        expect(最远).toBeLessThanOrEqual(候选.外径 + 1e-9);
      }
    });
    it(`${名}：会转`, () => {
      const 变 = 候选.层们.some((层) => 层.位姿(0).公转 !== 层.位姿(1).公转);
      expect(变).toBe(true);
    });
  }
});
