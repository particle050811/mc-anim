import { describe, expect, it } from 'vitest';
import {
  dayTicks,
  keyframeValue,
  skyDarken,
  skyDaylightMult,
  skyAngle,
  skyAngleToGameTime,
  sunDirection,
  defineEnvironment,
  defineEnvTrack,
  tickByFrame,
  azimuthToVec,
  starBrightness,
  dawnDuskColor,
  moonPhase,
  LightCoeffs,
  envAtFrame,
  rainSkyColor,
  type EnvDescription,
} from './环境.ts';
import { overworld, twilightForest, nether } from './维度.ts';

const elevationOf = (d: number[]) => (Math.asin(d[2]! / Math.hypot(...d)) * 180) / Math.PI;
const overworldBase = (overrides: Partial<EnvDescription> = {}): EnvDescription => ({ dimension: overworld, 画法: '主世界', gameTime: 6000, lightSpec: { tier: '主世界' }, fog: { 种类: '无' }, cloud: { 种类: '无' }, ...overrides });

describe('时刻 → 天体（1.20.1 DimensionType.timeOfDay）', () => {
  it('正午、午夜、日出、日落的天角', () => {
    expect(skyAngle(6000)).toBe(0);
    expect(skyAngle(18000)).toBeCloseTo(0.5, 6);
    expect(skyAngle(0)).toBeCloseTo(0.784518, 5);
    expect(skyAngle(12000)).toBeCloseTo(0.215482, 5);
    expect(skyAngle(6000 + dayTicks * 3)).toBe(0);
  });
  it('一天里单调走一圈', () => {
    let prevAngle = -1;
    for (let t = 6000; t < 6000 + dayTicks; t += 50) {
      const a = (skyAngle(t) - skyAngle(6000) + 1) % 1;
      expect(a).toBeGreaterThan(prevAngle);
      prevAngle = a;
    }
  });
  it('太阳东升、正午在头顶、西落；午夜在脚下', () => {
    const sunriseDir = sunDirection(skyAngle(0));
    expect(sunriseDir[0]).toBeGreaterThan(0.9);
    expect(elevationOf(sunriseDir)).toBeCloseTo(12.4, 0);
    const noon = sunDirection(skyAngle(6000));
    expect(noon[2]).toBeCloseTo(1, 9);
    const sunsetDir = sunDirection(skyAngle(12000));
    expect(sunsetDir[0]).toBeLessThan(-0.9);
    expect(elevationOf(sunsetDir)).toBeCloseTo(12.4, 0);
    expect(sunDirection(skyAngle(18000))[2]).toBeCloseTo(-1, 6);
    // 原版轨道没有南北分量
    expect(sunsetDir[1]).toBeCloseTo(0, 12);
  });
  it('轨道往南倾：正午太阳偏南', () => {
    const d = sunDirection(0, 30);
    expect(d[1]).toBeCloseTo(-0.5, 9);
    expect(d[2]).toBeCloseTo(Math.cos(Math.PI / 6), 9);
  });
  it('天角转时刻是反函数；SUN_OW（正西仰角 20°）约 11508 刻', () => {
    for (const t of [0, 1000, 6000, 11000, 12500, 18000, 23999]) expect(skyAngle(skyAngleToGameTime(skyAngle(t)))).toBeCloseTo(skyAngle(t), 6);
    const sunOw = [-0.94, 0, 0.342];
    const t = skyAngleToGameTime(Math.atan2(-sunOw[0]!, sunOw[2]!) / (2 * Math.PI));
    expect(t).toBeGreaterThan(11490);
    expect(t).toBeLessThan(11530);
  });
  it('月相按第几天走，整除向零取', () => {
    expect(moonPhase(0)).toBe(0);
    expect(moonPhase(23999)).toBe(0);
    expect(moonPhase(24000)).toBe(1);
    expect(moonPhase(8 * 24000 + 5)).toBe(0);
    expect(moonPhase(-1)).toBe(0);
    expect(moonPhase(-24000)).toBe(7);
  });
  it('方位仰角换向量（0 = 北、顺时针）', () => {
    const d = azimuthToVec(270, 0);
    expect(d[0]).toBeCloseTo(-1, 12);
    expect(d[1]).toBeCloseTo(0, 12);
  });
});

describe('天光、星星、晚霞、雨（ClientLevel、DimensionSpecialEffects）', () => {
  it('天光：正午 1、午夜 0.2，雨、雷各压 5/16', () => {
    expect(skyDarken(0)).toBe(1);
    expect(skyDarken(0.5)).toBeCloseTo(0.2, 9);
    expect(skyDarken(0, { 雨: 1, 雷: 0 })).toBeCloseTo(0.8 * (11 / 16) + 0.2, 9);
    expect(skyDarken(0, { 雨: 1, 雷: 1 })).toBeCloseTo(0.8 * (11 / 16) ** 2 + 0.2, 9);
    // 雷只在下雨时算
    expect(skyDarken(0, { 雨: 0, 雷: 1 })).toBe(1);
  });
  it('星星：白天 0、半夜 0.5、下雨看不见', () => {
    expect(starBrightness(0)).toBe(0);
    expect(starBrightness(0.5)).toBeCloseTo(0.5, 9);
    expect(starBrightness(0.5, { 雨: 1, 雷: 0 })).toBe(0);
  });
  it('天色倍：正午 1、半夜 0', () => {
    expect(skyDaylightMult(0)).toBe(1);
    expect(skyDaylightMult(0.5)).toBe(0);
  });
  it('晚霞只在太阳贴着地平线时有', () => {
    expect(dawnDuskColor(0)).toBeNull();
    const c = dawnDuskColor(0.25)!;
    expect(c[0]).toBeCloseTo(0.85, 6);
    expect(c[1]).toBeCloseTo(0.375, 6);
    expect(c[2]).toBeCloseTo(0.2, 6);
    expect(c[3]).toBeCloseTo(1, 6);
  });
  it('雨天天色往灰里拉', () => {
    const c = rainSkyColor([1, 1, 1], { 雨: 1, 雷: 0 });
    for (const x of c) expect(x).toBeCloseTo(0.7, 9);
    expect(rainSkyColor([0.2, 0.4, 0.9], { 雨: 0, 雷: 0 })).toEqual([0.2, 0.4, 0.9]);
  });
});

describe('灯光系数', () => {
  it('美术光向、晴天：光向原样（同一个数组），两个倍数正好是 1', () => {
    const sun: [number, number, number] = [0.78, -0.33, 0.53];
    const k = LightCoeffs(defineEnvironment({ dimension: twilightForest, 画法: '暮色', sun: sun, lightSpec: { tier: '暮色' }, fog: { 种类: '无' }, cloud: { 种类: '无' } }));
    expect(k.lightDir).toBe(sun);
    expect(k.sun).toBe(sun);
    expect(k.directMult).toBe(1);
    expect(k.skyLightMult).toBe(1);
    expect(k.isMoonLight).toBe(false);
  });
  it('美术光向下雨：直射 × (1 − 雨)', () => {
    const k = LightCoeffs(overworldBase({ gameTime: undefined, sun: { azimuthDeg: 270, elevationDeg: 20 }, weather: { 雨: 0.5, 雷: 0 } }));
    expect(k.directMult).toBeCloseTo(0.5, 12);
    expect(k.skyLightMult).toBeCloseTo(skyDarken(0, { 雨: 0.5, 雷: 0 }), 12);
  });
  it('按时刻：正午日光满，满月半夜换月光，新月没有主光', () => {
    const noonLight = LightCoeffs(overworldBase());
    expect(noonLight.directMult).toBe(1);
    expect(noonLight.skyLightMult).toBe(1);
    const nightLight = LightCoeffs(overworldBase({ gameTime: 18000 }));
    expect(nightLight.isMoonLight).toBe(true);
    expect(nightLight.lightDir[2]).toBeCloseTo(1, 6);
    expect(nightLight.sun[2]).toBeCloseTo(-1, 6);
    expect(nightLight.directMult).toBeCloseTo(0.1, 9);
    expect(nightLight.skyLightMult).toBeCloseTo(0.2, 9);
    const newMoonLight = LightCoeffs(overworldBase({ gameTime: 18000 + 4 * dayTicks }));
    expect(newMoonLight.directMult).toBe(0);
  });
  it('固定时刻的维度按固定时刻算（暮色森林 13000：太阳刚落到西边地平线下）', () => {
    const k = LightCoeffs({ dimension: twilightForest, 画法: '暮色', lightSpec: { tier: '暮色' }, fog: { 种类: '无' }, cloud: { 种类: '无' } });
    expect(k.sun[0]).toBeLessThan(-0.99);
    expect(elevationOf(k.sun)).toBeCloseTo(-3.5, 0);
  });
});

describe('定义环境：写错了加载时就报', () => {
  it('维度时间固定还写时刻', () => {
    expect(() => defineEnvironment({ ...overworldBase(), dimension: nether })).toThrow(/固定在 18000/);
  });
  it('时刻、太阳只写一个，也不能都不写', () => {
    expect(() => defineEnvironment(overworldBase({ sun: [0, 0, 1] }))).toThrow(/只写一个/);
    expect(() => defineEnvironment(overworldBase({ gameTime: undefined }))).toThrow(/时刻 或 太阳/);
  });
  it('天气、雾越界', () => {
    expect(() => defineEnvironment(overworldBase({ weather: { 雨: 1.5, 雷: 0 } }))).toThrow(/0～1/);
    expect(() => defineEnvironment(overworldBase({ fog: { 种类: '线性', near: 100, far: 50 } }))).toThrow(/近 < 远/);
    expect(() => defineEnvironment(overworldBase({ fog: { 种类: '指数平方', visibility: 0 } }))).toThrow(/能见度/);
  });
  it('自定配比不能是负的', () => {
    expect(() => defineEnvironment(overworldBase({ lightSpec: { lightMix: { direct: 3, skylight: -1, ambient: 0, selfLight: 0 } } }))).toThrow(/配比\.skylight/);
    expect(defineEnvironment(overworldBase({ lightSpec: { lightMix: { direct: 3, skylight: 1, ambient: 0, selfLight: 0 } } })).lightSpec).toHaveProperty('lightMix');
    expect(() => defineEnvironment(overworldBase({ lightSpec: { tier: '傍晚' as never } }))).toThrow(/没有灯光档位「傍晚」/);
    expect(() => defineEnvironment(overworldBase({ 画法: '' }))).toThrow(/画法/);
    expect(() => defineEnvironment(overworldBase({ 画法: '../主世界' }))).toThrow(/画法/);
  });
});

describe('关键帧：时刻、天气随帧变', () => {
  const envTrack = defineEnvTrack({
    base: overworldBase({ gameTime: 1000 }),
    keyframes: [
      { frame: 0, 时刻: 11000 },
      { frame: 10, 雨: 0, easing: '平滑' },
      { frame: 20, 雨: 1 },
      { frame: 48, 时刻: 13000, easing: '阶跃' },
      { frame: 60, 时刻: 14000 },
    ],
  });
  it('各项各自插值，头尾之外保持', () => {
    expect(keyframeValue(envTrack.keyframes, '时刻', 24)).toBeCloseTo(12000, 9);
    expect(keyframeValue(envTrack.keyframes, '时刻', 100)).toBe(14000);
    expect(keyframeValue(envTrack.keyframes, '雨', 0)).toBe(0);
    expect(keyframeValue(envTrack.keyframes, '雨', 15)).toBeCloseTo(0.5, 12);
    expect(keyframeValue(envTrack.keyframes, '雨', 12)).toBeCloseTo(0.2 * 0.2 * (3 - 0.4), 12);
    expect(keyframeValue(envTrack.keyframes, '雷', 30)).toBeUndefined();
  });
  it('阶跃到下一帧才跳', () => {
    expect(keyframeValue(envTrack.keyframes, '时刻', 59)).toBe(13000);
    expect(keyframeValue(envTrack.keyframes, '时刻', 60)).toBe(14000);
  });
  it('环境在：基础上换掉时刻、天气；没写的天气项沿用基础', () => {
    const e = envAtFrame(envTrack, 20);
    expect(e.gameTime).toBeCloseTo(11000 + (2000 * 20) / 48, 9);
    expect(e.weather).toEqual({ 雨: 1, 雷: 0 });
    expect(e.dimension).toBe(overworld);
    const description = overworldBase();
    expect(envAtFrame(description, 5)).toBe(description);
  });
  it('写错的关键帧', () => {
    const base = overworldBase();
    expect(() => defineEnvTrack({ base, keyframes: [{ frame: 5, 雨: 1 }, { frame: 5, 雨: 0 }] })).toThrow(/从小到大/);
    expect(() => defineEnvTrack({ base, keyframes: [{ frame: 0 }] })).toThrow(/至少写一项/);
    expect(() => defineEnvTrack({ base: overworldBase({ gameTime: undefined, sun: [0, 0, 1] }), keyframes: [{ frame: 0, 时刻: 1000 }] })).toThrow(/美术光向/);
    expect(() => defineEnvTrack({ base, keyframes: [{ frame: 1.5, 雨: 1 }] })).toThrow(/非负整数/);
  });
  it('按游戏流速：每秒 20 刻', () => {
    expect(tickByFrame(1000, 24, 24)).toBe(1020);
    expect(tickByFrame(1000, 24, 24, 60)).toBe(2200);
  });
});
