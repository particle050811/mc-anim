import { describe, expect, it } from 'vitest';
import { 乘, 天球半径, 天球矩阵, 旧随机, 月亮顶点, 月相格, 原版星星 } from './天球.ts';
import { 天角, 太阳方向 } from './环境.ts';

describe('旧随机（java.util.Random）', () => {
  it('和 Java 逐位一样：new Random(10842) 的前几个 nextFloat、nextDouble（zulu-8 javac 跑的）', () => {
    const r = new 旧随机(10842);
    expect(Math.fround(r.nextFloat())).toBe(Math.fround(0.12987703));
    expect(Math.fround(r.nextFloat())).toBe(Math.fround(0.037620723));
    expect(Math.fround(r.nextFloat())).toBe(Math.fround(0.8834354));
    expect(Math.fround(r.nextFloat())).toBe(Math.fround(0.9509856));
    expect(r.nextDouble()).toBe(0.3331155735128949);
  });
});

describe('原版星星', () => {
  const v = 原版星星();
  const 颗 = v.length / 12;
  it('撒 1500 次、只留球壳里的，颗数固定，两次一样', () => {
    expect(v.length % 12).toBe(0);
    expect(颗).toBeGreaterThan(700);
    expect(颗).toBeLessThan(1500);
    expect(原版星星()).toEqual(v);
  });
  it('每颗是 100 格外、和视线垂直的方片，边长 0.3～0.5', () => {
    for (let i = 0; i < 颗; i++) {
      const p = [0, 1, 2, 3].map((j) => [v[i * 12 + j * 3]!, v[i * 12 + j * 3 + 1]!, v[i * 12 + j * 3 + 2]!]);
      const 心 = [0, 1, 2].map((k) => (p[0]![k]! + p[2]![k]!) / 2);
      expect(Math.hypot(...心)).toBeCloseTo(天球半径, 6);
      const 边 = Math.hypot(...[0, 1, 2].map((k) => p[1]![k]! - p[0]![k]!));
      expect(边).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(边).toBeLessThanOrEqual(0.5 + 1e-6);
      const 边向 = [0, 1, 2].map((k) => p[1]![k]! - p[0]![k]!);
      expect(Math.abs(边向[0]! * 心[0]! + 边向[1]! * 心[1]! + 边向[2]! * 心[2]!)).toBeLessThan(1e-6);
    }
  });
});

describe('月亮', () => {
  it('月相 → moon_phases.png 的格：上排 0～3，下排 4～7', () => {
    expect(月相格(0)).toEqual([0, 0, 0.25, 0.5]);
    expect(月相格(3)).toEqual([0.75, 0, 1, 0.5]);
    expect(月相格(4)).toEqual([0, 0.5, 0.25, 1]);
    expect(月相格(7)).toEqual([0.75, 0.5, 1, 1]);
  });
  it('方片在太阳对面（游戏 −Y 100 格），边长 40', () => {
    const q = 月亮顶点(0);
    for (const p of q) expect(p[1]).toBe(-天球半径);
    expect(Math.abs(q[0]![0] - q[1]![0])).toBe(40);
  });
});

describe('天球矩阵', () => {
  it('游戏 +Y 转出来就是 太阳方向（含轨道倾角）', () => {
    for (const t of [0, 3000, 6000, 12000, 13800, 18000, 22500])
      for (const 倾 of [0, 20, -35]) {
        const 角 = 天角(t);
        const 日 = 太阳方向(角, 倾);
        const 转 = 乘(天球矩阵(角, 倾), [0, 1, 0]);
        for (let k = 0; k < 3; k++) expect(转[k]).toBeCloseTo(日[k]!, 12);
      }
  });
  it('是转动：正交、行列式 1（贴图不镜像）', () => {
    const m = 天球矩阵(0.37, 15);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) expect(m[i]![0] * m[j]![0] + m[i]![1] * m[j]![1] + m[i]![2] * m[j]![2]).toBeCloseTo(i === j ? 1 : 0, 12);
    const det =
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    expect(det).toBeCloseTo(1, 12);
  });
  it('午夜月亮在头顶', () => {
    const 角 = 天角(18000);
    const 月 = 乘(天球矩阵(角), [0, -1, 0]);
    expect(月[2]).toBeCloseTo(1, 6);
  });
});
