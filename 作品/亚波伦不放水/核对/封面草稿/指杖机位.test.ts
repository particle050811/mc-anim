// 指杖机位（封面八稿的机位反算）和画面自检：纯几何，不用模型字节。
import { describe, expect, it } from 'vitest';
import { 仰角, 指杖机位, 投影, 椭圆轴, 画面自检, 盘面基 } from './指杖机位.ts';

const 宽高比 = 16 / 9;
const 归一 = (a: readonly number[]) => a.map((x) => x / Math.hypot(...a));
const 点乘 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const 减 = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];

describe('指杖机位', () => {
  const 例 = [
    { 心: [1, 2, 3], d: 归一([-0.5, -0.6, -0.7]), θ: 35, 方位: 100, 距: 2.6, lens: 22, 盘心画面: [0.51, 0.56] as const },
    { 心: [0, 0, 5], d: 归一([0.3, -0.8, -0.5]), θ: 55, 方位: 250, 距: 4, lens: 18, 盘心画面: [0.6, 0.6] as const },
    { 心: [-2, 1, 4], d: 归一([0.1, 0.2, -0.97]), θ: 70, 方位: 20, 距: 3, lens: 28, 盘心画面: [0.5, 0.5] as const },
    { 心: [0, 0, 0], d: [0, 1, 0], θ: 0, 方位: 0, 距: 5, lens: 22, 盘心画面: [0.3, 0.7] as const },
  ];
  it.each(例)('θ $θ：镜头到盘心的距离、和杖的夹角是给的数，镜头在盘的正面一侧，盘心落在给的画面位置', (参) => {
    const 机位 = 指杖机位({ ...参, 宽高比 });
    const 到镜头 = 减(机位.pos, 参.心);
    expect(Math.hypot(...到镜头)).toBeCloseTo(参.距, 9);
    expect((Math.acos(点乘(到镜头, 参.d) / 参.距) * 180) / Math.PI).toBeCloseTo(参.θ, 6);
    if (参.θ < 90) expect(点乘(到镜头, 参.d)).toBeGreaterThan(0);
    const 投 = 投影(机位, 宽高比, 参.心);
    expect(投.x).toBeCloseTo(参.盘心画面[0], 9);
    expect(投.y).toBeCloseTo(参.盘心画面[1], 9);
    expect(投.深).toBeGreaterThan(0);
  });

  it('方位角：0 偏向盘面里朝上的方向，90 偏向 d × 上', () => {
    const d = [0, -1, 0];
    const { u, v } = 盘面基(d);
    expect(u).toEqual([0, 0, 1]);
    const 偏 = (方位: number) => 减(指杖机位({ 心: [0, 0, 0], d, θ: 90, 方位, 距: 1, lens: 22, 盘心画面: [0.5, 0.5], 宽高比 }).pos, [0, 0, 0]);
    expect(点乘(偏(0), u)).toBeCloseTo(1, 9);
    expect(点乘(偏(90), v)).toBeCloseTo(1, 9);
  });

  it('镜头几乎竖直往上看、盘心又要偏到画面一边：不滚转摆不出来，报错', () => {
    expect(() => 指杖机位({ 心: [0, 0, 5], d: [0, 0, -1], θ: 0, 方位: 0, 距: 3, lens: 22, 盘心画面: [0.9, 0.5], 宽高比 })).toThrow(/竖直/);
  });
});

describe('投影、仰角、椭圆轴', () => {
  it('光轴上的点在画面正中；右边的点 x 大，上面的点 y 小；画面右边缘在 18 / lens 处', () => {
    const 机位 = { pos: [0, 0, 0] as [number, number, number], tgt: [0, 1, 0] as [number, number, number], lens: 18 };
    expect(投影(机位, 宽高比, [0, 7, 0])).toEqual({ x: 0.5, y: 0.5, 深: 7 });
    expect(投影(机位, 宽高比, [1, 1, 0]).x).toBeCloseTo(1, 9);
    expect(投影(机位, 宽高比, [0, 1, 1 / 宽高比]).y).toBeCloseTo(0, 9);
  });
  it('仰角：往上 45 度看是 45', () => {
    expect(仰角({ pos: [0, 0, 0], tgt: [0, 1, 1] })).toBeCloseTo(45, 9);
    expect(仰角({ pos: [0, 0, 2], tgt: [3, 0, 2] })).toBeCloseTo(0, 9);
  });
  it('椭圆轴：半轴 2、1、长轴斜 30 度的椭圆', () => {
    const [c, s] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
    const 边 = Array.from({ length: 720 }, (_, i) => {
      const t = (i / 720) * 2 * Math.PI;
      return [2 * Math.cos(t) * c - Math.sin(t) * s, 2 * Math.cos(t) * s + Math.sin(t) * c] as const;
    });
    const 轴 = 椭圆轴(边);
    expect(轴.长).toBeCloseTo(4, 3);
    expect(轴.短).toBeCloseTo(2, 3);
    expect(Math.abs(轴.长向[0] * c + 轴.长向[1] * s)).toBeCloseTo(1, 4);
  });
});

describe('画面自检', () => {
  // 她站在原点、面朝 −y（朝南），杖从 (0, −0.5, 1.5) 往南偏下指；身体点只给头顶和脚底
  const d = 归一([0, -1, -1]);
  const 心 = [0, -1.5, 0.5];
  const 她 = { 杖尾: [0, -0.5, 1.5], 脸: [0, -0.1, 1.6], 脸朝向: 归一([0, -1, -1]), 身朝向: [0, -1, 0], 身体点: [[0, 0, 2], [0, 0, 0]] };
  const 检 = (θ: number, 方位: number, 距 = 30, lens = 100) =>
    画面自检({ 机位: 指杖机位({ 心, d, θ, 方位, 距, lens, 盘心画面: [0.5, 0.5], 宽高比 }), 宽高比, 心, d, 半径: 1, ...她 });

  it('θ = 0：盘是正圆，她的脸隔着盘，镜头在正面一侧、在她下方仰拍 45 度', () => {
    const 数 = 检(0, 0);
    expect(数.短长比).toBeCloseTo(1, 2);
    expect(数.正面侧).toBeCloseTo(30, 6);
    expect(数.脸隔着盘).toBe(true);
    expect(数.仰角).toBeCloseTo(45, 6);
    expect(数.镜头低).toBeGreaterThan(0);
    expect(数.脚近头远).toBeGreaterThan(0);
    expect(数.脸朝镜头).toBeGreaterThan(0.99);
  });

  it('θ = 60（远、长焦）：短轴 ÷ 长轴 = cos 60°，短轴顺着杖在画面上的方向；镜头偏到哪一侧，杖就朝画面的另一侧指', () => {
    const 数 = 检(60, 90);
    expect(数.θ).toBeCloseTo(60, 6);
    expect(数.短长比).toBeCloseTo(0.5, 2);
    expect(数.短轴偏杖).toBeLessThan(1);
    expect(数.盘在画内).toBe(1);
    expect(数.正面侧).toBeGreaterThan(0);
    const 反 = 检(60, 270);
    expect(Math.sign(Math.cos((数.杖向 * Math.PI) / 180))).toBe(-Math.sign(Math.cos((反.杖向 * Math.PI) / 180)));
  });

  it('镜头贴近、广角：盘出画，盘在画内不到 1', () => {
    expect(检(60, 90, 1.2, 18).盘在画内).toBeLessThan(1);
  });
});
