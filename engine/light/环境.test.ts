import { describe, expect, it } from 'vitest';
import {
  一天,
  关键帧取值,
  天空变暗,
  天色倍,
  天角,
  天角转时刻,
  太阳方向,
  定义环境,
  定义环境轨,
  按游戏流速,
  方位转向量,
  星星亮度,
  晨昏色,
  月相,
  灯光系数,
  环境在,
  雨天天色,
  type 环境描述,
} from './环境.ts';
import { 主世界, 暮色森林, 下界 } from './维度.ts';

const 仰角 = (d: number[]) => (Math.asin(d[2]! / Math.hypot(...d)) * 180) / Math.PI;
const 主世界基础 = (改: Partial<环境描述> = {}): 环境描述 => ({ 维度: 主世界, 画法: '主世界', 时刻: 6000, 灯光: { 档位: '主世界' }, 雾: { 种类: '无' }, 云: { 种类: '无' }, ...改 });

describe('时刻 → 天体（1.20.1 DimensionType.timeOfDay）', () => {
  it('正午、午夜、日出、日落的天角', () => {
    expect(天角(6000)).toBe(0);
    expect(天角(18000)).toBeCloseTo(0.5, 6);
    expect(天角(0)).toBeCloseTo(0.784518, 5);
    expect(天角(12000)).toBeCloseTo(0.215482, 5);
    expect(天角(6000 + 一天 * 3)).toBe(0);
  });
  it('一天里单调走一圈', () => {
    let 上 = -1;
    for (let t = 6000; t < 6000 + 一天; t += 50) {
      const a = (天角(t) - 天角(6000) + 1) % 1;
      expect(a).toBeGreaterThan(上);
      上 = a;
    }
  });
  it('太阳东升、正午在头顶、西落；午夜在脚下', () => {
    const 日出 = 太阳方向(天角(0));
    expect(日出[0]).toBeGreaterThan(0.9);
    expect(仰角(日出)).toBeCloseTo(12.4, 0);
    const 午 = 太阳方向(天角(6000));
    expect(午[2]).toBeCloseTo(1, 9);
    const 落 = 太阳方向(天角(12000));
    expect(落[0]).toBeLessThan(-0.9);
    expect(仰角(落)).toBeCloseTo(12.4, 0);
    expect(太阳方向(天角(18000))[2]).toBeCloseTo(-1, 6);
    // 原版轨道没有南北分量
    expect(落[1]).toBeCloseTo(0, 12);
  });
  it('轨道往南倾：正午太阳偏南', () => {
    const d = 太阳方向(0, 30);
    expect(d[1]).toBeCloseTo(-0.5, 9);
    expect(d[2]).toBeCloseTo(Math.cos(Math.PI / 6), 9);
  });
  it('天角转时刻是反函数；SUN_OW（正西仰角 20°）约 11508 刻', () => {
    for (const t of [0, 1000, 6000, 11000, 12500, 18000, 23999]) expect(天角(天角转时刻(天角(t)))).toBeCloseTo(天角(t), 6);
    const sunOw = [-0.94, 0, 0.342];
    const t = 天角转时刻(Math.atan2(-sunOw[0]!, sunOw[2]!) / (2 * Math.PI));
    expect(t).toBeGreaterThan(11490);
    expect(t).toBeLessThan(11530);
  });
  it('月相按第几天走，整除向零取', () => {
    expect(月相(0)).toBe(0);
    expect(月相(23999)).toBe(0);
    expect(月相(24000)).toBe(1);
    expect(月相(8 * 24000 + 5)).toBe(0);
    expect(月相(-1)).toBe(0);
    expect(月相(-24000)).toBe(7);
  });
  it('方位仰角换向量（0 = 北、顺时针）', () => {
    const d = 方位转向量(270, 0);
    expect(d[0]).toBeCloseTo(-1, 12);
    expect(d[1]).toBeCloseTo(0, 12);
  });
});

describe('天光、星星、晚霞、雨（ClientLevel、DimensionSpecialEffects）', () => {
  it('天光：正午 1、午夜 0.2，雨、雷各压 5/16', () => {
    expect(天空变暗(0)).toBe(1);
    expect(天空变暗(0.5)).toBeCloseTo(0.2, 9);
    expect(天空变暗(0, { 雨: 1, 雷: 0 })).toBeCloseTo(0.8 * (11 / 16) + 0.2, 9);
    expect(天空变暗(0, { 雨: 1, 雷: 1 })).toBeCloseTo(0.8 * (11 / 16) ** 2 + 0.2, 9);
    // 雷只在下雨时算
    expect(天空变暗(0, { 雨: 0, 雷: 1 })).toBe(1);
  });
  it('星星：白天 0、半夜 0.5、下雨看不见', () => {
    expect(星星亮度(0)).toBe(0);
    expect(星星亮度(0.5)).toBeCloseTo(0.5, 9);
    expect(星星亮度(0.5, { 雨: 1, 雷: 0 })).toBe(0);
  });
  it('天色倍：正午 1、半夜 0', () => {
    expect(天色倍(0)).toBe(1);
    expect(天色倍(0.5)).toBe(0);
  });
  it('晚霞只在太阳贴着地平线时有', () => {
    expect(晨昏色(0)).toBeNull();
    const c = 晨昏色(0.25)!;
    expect(c[0]).toBeCloseTo(0.85, 6);
    expect(c[1]).toBeCloseTo(0.375, 6);
    expect(c[2]).toBeCloseTo(0.2, 6);
    expect(c[3]).toBeCloseTo(1, 6);
  });
  it('雨天天色往灰里拉', () => {
    const c = 雨天天色([1, 1, 1], { 雨: 1, 雷: 0 });
    for (const x of c) expect(x).toBeCloseTo(0.7, 9);
    expect(雨天天色([0.2, 0.4, 0.9], { 雨: 0, 雷: 0 })).toEqual([0.2, 0.4, 0.9]);
  });
});

describe('灯光系数', () => {
  it('美术光向、晴天：光向原样（同一个数组），两个倍数正好是 1', () => {
    const sun: [number, number, number] = [0.78, -0.33, 0.53];
    const k = 灯光系数(定义环境({ 维度: 暮色森林, 画法: '暮色', 太阳: sun, 灯光: { 档位: '暮色' }, 雾: { 种类: '无' }, 云: { 种类: '无' } }));
    expect(k.光向).toBe(sun);
    expect(k.太阳).toBe(sun);
    expect(k.直射倍).toBe(1);
    expect(k.天光倍).toBe(1);
    expect(k.月光).toBe(false);
  });
  it('美术光向下雨：直射 × (1 − 雨)', () => {
    const k = 灯光系数(主世界基础({ 时刻: undefined, 太阳: { 方位: 270, 仰角: 20 }, 天气: { 雨: 0.5, 雷: 0 } }));
    expect(k.直射倍).toBeCloseTo(0.5, 12);
    expect(k.天光倍).toBeCloseTo(天空变暗(0, { 雨: 0.5, 雷: 0 }), 12);
  });
  it('按时刻：正午日光满，满月半夜换月光，新月没有主光', () => {
    const 午 = 灯光系数(主世界基础());
    expect(午.直射倍).toBe(1);
    expect(午.天光倍).toBe(1);
    const 夜 = 灯光系数(主世界基础({ 时刻: 18000 }));
    expect(夜.月光).toBe(true);
    expect(夜.光向[2]).toBeCloseTo(1, 6);
    expect(夜.太阳[2]).toBeCloseTo(-1, 6);
    expect(夜.直射倍).toBeCloseTo(0.1, 9);
    expect(夜.天光倍).toBeCloseTo(0.2, 9);
    const 新月 = 灯光系数(主世界基础({ 时刻: 18000 + 4 * 一天 }));
    expect(新月.直射倍).toBe(0);
  });
  it('固定时刻的维度按固定时刻算（暮色森林 13000：太阳刚落到西边地平线下）', () => {
    const k = 灯光系数({ 维度: 暮色森林, 画法: '暮色', 灯光: { 档位: '暮色' }, 雾: { 种类: '无' }, 云: { 种类: '无' } });
    expect(k.太阳[0]).toBeLessThan(-0.99);
    expect(仰角(k.太阳)).toBeCloseTo(-3.5, 0);
  });
});

describe('定义环境：写错了加载时就报', () => {
  it('维度时间固定还写时刻', () => {
    expect(() => 定义环境({ ...主世界基础(), 维度: 下界 })).toThrow(/固定在 18000/);
  });
  it('时刻、太阳只写一个，也不能都不写', () => {
    expect(() => 定义环境(主世界基础({ 太阳: [0, 0, 1] }))).toThrow(/只写一个/);
    expect(() => 定义环境(主世界基础({ 时刻: undefined }))).toThrow(/时刻 或 太阳/);
  });
  it('天气、雾越界', () => {
    expect(() => 定义环境(主世界基础({ 天气: { 雨: 1.5, 雷: 0 } }))).toThrow(/0～1/);
    expect(() => 定义环境(主世界基础({ 雾: { 种类: '线性', 近: 100, 远: 50 } }))).toThrow(/近 < 远/);
    expect(() => 定义环境(主世界基础({ 雾: { 种类: '指数平方', 能见度: 0 } }))).toThrow(/能见度/);
  });
  it('自定配比不能是负的', () => {
    expect(() => 定义环境(主世界基础({ 灯光: { 配比: { 直射: 3, 天光: -1, 环境光: 0, 自发光: 0 } } }))).toThrow(/配比.天光/);
    expect(定义环境(主世界基础({ 灯光: { 配比: { 直射: 3, 天光: 1, 环境光: 0, 自发光: 0 } } })).灯光).toHaveProperty('配比');
  });
});

describe('关键帧：时刻、天气随帧变', () => {
  const 轨 = 定义环境轨({
    基础: 主世界基础({ 时刻: 1000 }),
    关键帧: [
      { 帧: 0, 时刻: 11000 },
      { 帧: 10, 雨: 0, 缓动: '平滑' },
      { 帧: 20, 雨: 1 },
      { 帧: 48, 时刻: 13000, 缓动: '阶跃' },
      { 帧: 60, 时刻: 14000 },
    ],
  });
  it('各项各自插值，头尾之外保持', () => {
    expect(关键帧取值(轨.关键帧, '时刻', 24)).toBeCloseTo(12000, 9);
    expect(关键帧取值(轨.关键帧, '时刻', 100)).toBe(14000);
    expect(关键帧取值(轨.关键帧, '雨', 0)).toBe(0);
    expect(关键帧取值(轨.关键帧, '雨', 15)).toBeCloseTo(0.5, 12);
    expect(关键帧取值(轨.关键帧, '雨', 12)).toBeCloseTo(0.2 * 0.2 * (3 - 0.4), 12);
    expect(关键帧取值(轨.关键帧, '雷', 30)).toBeUndefined();
  });
  it('阶跃到下一帧才跳', () => {
    expect(关键帧取值(轨.关键帧, '时刻', 59)).toBe(13000);
    expect(关键帧取值(轨.关键帧, '时刻', 60)).toBe(14000);
  });
  it('环境在：基础上换掉时刻、天气；没写的天气项沿用基础', () => {
    const e = 环境在(轨, 20);
    expect(e.时刻).toBeCloseTo(11000 + (2000 * 20) / 48, 9);
    expect(e.天气).toEqual({ 雨: 1, 雷: 0 });
    expect(e.维度).toBe(主世界);
    const 描述 = 主世界基础();
    expect(环境在(描述, 5)).toBe(描述);
  });
  it('写错的关键帧', () => {
    const 基础 = 主世界基础();
    expect(() => 定义环境轨({ 基础, 关键帧: [{ 帧: 5, 雨: 1 }, { 帧: 5, 雨: 0 }] })).toThrow(/从小到大/);
    expect(() => 定义环境轨({ 基础, 关键帧: [{ 帧: 0 }] })).toThrow(/至少写一项/);
    expect(() => 定义环境轨({ 基础: 主世界基础({ 时刻: undefined, 太阳: [0, 0, 1] }), 关键帧: [{ 帧: 0, 时刻: 1000 }] })).toThrow(/美术光向/);
    expect(() => 定义环境轨({ 基础, 关键帧: [{ 帧: 1.5, 雨: 1 }] })).toThrow(/非负整数/);
  });
  it('按游戏流速：每秒 20 刻', () => {
    expect(按游戏流速(1000, 24, 24)).toBe(1020);
    expect(按游戏流速(1000, 24, 24, 60)).toBe(2200);
  });
});
