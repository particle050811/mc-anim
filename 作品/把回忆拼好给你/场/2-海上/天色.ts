// 第 4 句日落的天色：按视线的仰角和离太阳的方位差取色，分档硬边（像素画不画平滑渐变）。天（天.tsx）和水面远处的雾（海面.tsx）都从这里取，
// 海的最远一档雾和地平线下面的天是同一个颜色，所以海一直铺到天边、看不见水面的边。纯模块。
// 原版的样子见 参数.ts 天色 的注释：天顶群系天色压暗，地平线一圈雾色，朝太阳那一扇混进日出日落色。
import { 天色, 天档数, 天渐变高, 晚霞宽 } from './参数.ts';

export type RGB = readonly [number, number, number];

const 解 = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const 混 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const 夹 = (v: number) => Math.min(1, Math.max(0, v));
/** 0～1 分成 n 档 */
const 档 = (v: number, n: number) => Math.round(夹(v) * n) / n;

const 色 = { 顶: 解(天色.顶), 背日: 解(天色.背日地平), 向日: 解(天色.向日地平), 日下: 解(天色.日下) };
/** 日落色往两边铺的档数、太阳正下方那一小扇的宽（方位角，度）和档数：档分得细，相邻两档颜色差得小，横着看不出一格一格的台阶 */
const 晚霞档 = 8;
const 日下宽 = 晚霞宽 * 0.3;
const 日下档 = 3;

/** 地平线上（和地平线以下）离太阳方位差 差 度处的颜色，sRGB 0～255 */
export const 地平色 = (差: number): RGB => {
  const d = Math.abs(差);
  const 霞 = 档(Math.pow(夹(1 - d / 晚霞宽), 1.5), 晚霞档);
  const 下 = 档(夹(1 - d / 日下宽), 日下档);
  return 混(混(色.背日, 色.向日, 霞), 色.日下, 下 * 0.7);
};

/** 视线仰角 仰 度、离太阳方位差 差 度处的天色；仰 ≤ 0（地平线以下）就是 地平色。
 *  朝太阳那边地平线的颜色往上铺得高（渐变高放大），色带的边是一道道以太阳为顶的弧，不是横平竖直的格子 */
export const 天色在 = (仰: number, 差: number): RGB => {
  const 地 = 地平色(差);
  if (仰 <= 0) return 地;
  const 暖 = Math.pow(夹(1 - Math.abs(差) / 晚霞宽), 1.5);
  return 混(地, 色.顶, 档(Math.sqrt(夹(仰 / (天渐变高 * (0.55 + 0.45 * 暖)))), 天档数));
};

/** 0～180 度每度一格的地平色（RGBA 字节），海面着色器按方位差查 */
export const 地平色表 = (): Uint8Array => {
  const r = new Uint8Array(181 * 4);
  for (let d = 0; d <= 180; d++) {
    const c = 地平色(d);
    r.set([Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255], d * 4);
  }
  return r;
};
