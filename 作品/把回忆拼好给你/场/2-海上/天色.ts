// 第 4 句日落的天色：按视线的仰角和离太阳的方位差取色，分档硬边（像素画不画平滑渐变）。天（天.tsx）和水面远处的雾（海面.tsx）都从这里取，
// 海的最远一档雾和地平线下面的天是同一个颜色，所以海一直铺到天边、看不见水面的边。纯模块。
// 原版的样子见 参数.ts 天色 的注释：天顶群系天色压暗，地平线一圈雾色，朝太阳那一扇混进日出日落色。
import { skyColors, skyTierCount, skyGradientHeight, afterglowWidth } from './参数.ts';

export type RGB = readonly [number, number, number];

const parseColor = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0～1 分成 n 档 */
const quantizeLevel = (v: number, n: number) => Math.round(clamp01(v) * n) / n;

const decodedSkyColors = { topColor: parseColor(skyColors.topColor), awaySun: parseColor(skyColors.awaySunHorizon), towardSun: parseColor(skyColors.towardSunHorizon), belowSun: parseColor(skyColors.belowSun) };
/** 日落色往两边铺的档数、太阳正下方那一小扇的宽（方位角，度）和档数：档分得细，相邻两档颜色差得小，横着看不出一格一格的台阶 */
const afterglowTier = 8;
const belowSunWidth = afterglowWidth * 0.3;
const belowSunTier = 3;

/** 地平线上（和地平线以下）离太阳方位差 差 度处的颜色，sRGB 0～255 */
export const horizonColor = (azimuthDiff: number): RGB => {
  const d = Math.abs(azimuthDiff);
  const sunsetGlow = quantizeLevel(Math.pow(clamp01(1 - d / afterglowWidth), 1.5), afterglowTier);
  const belowSun = quantizeLevel(clamp01(1 - d / belowSunWidth), belowSunTier);
  return mix(mix(decodedSkyColors.awaySun, decodedSkyColors.towardSun, sunsetGlow), decodedSkyColors.belowSun, belowSun * 0.7);
};

/** 视线仰角 仰 度、离太阳方位差 差 度处的天色；仰 ≤ 0（地平线以下）就是 地平色。
 *  朝太阳那边地平线的颜色往上铺得高（渐变高放大），色带的边是一道道以太阳为顶的弧，不是横平竖直的格子 */
export const skyColorAt = (elevation: number, azimuthDiff: number): RGB => {
  const horizon = horizonColor(azimuthDiff);
  if (elevation <= 0) return horizon;
  const warm = Math.pow(clamp01(1 - Math.abs(azimuthDiff) / afterglowWidth), 1.5);
  return mix(horizon, decodedSkyColors.topColor, quantizeLevel(Math.sqrt(clamp01(elevation / (skyGradientHeight * (0.55 + 0.45 * warm)))), skyTierCount));
};

/** 0～180 度每度一格的地平色（RGBA 字节），海面着色器按方位差查 */
export const horizonColorTable = (): Uint8Array => {
  const r = new Uint8Array(181 * 4);
  for (let d = 0; d <= 180; d++) {
    const c = horizonColor(d);
    r.set([Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255], d * 4);
  }
  return r;
};
