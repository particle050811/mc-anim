// 原版 1.20.1 下雨、打雷时的天色、云色、雾色（ClientLevel.getSkyColor、getCloudColor，FogRenderer.setupColor；javap 核过的算法）。纯计算。
// 颜色都是 sRGB 数值（0～1），原版就在这上面算（不过线性空间）。白天的亮度系数按 参.白天刻 算（7000 刻时是 1）。
import * as params from './参数.ts';

export type RGB = readonly [number, number, number];
const hexToRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as RGB;
export const colorToHex = (c: RGB) => '#' + c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');
export const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const luminance = (c: RGB) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

/** 平原的天色（sky_color 7907327）、雾色（fog_color 12638463） */
const plainsSky = hexToRgb('#78a7ff');
const plainsFog = hexToRgb('#c0d8ff');

/** 一天里的太阳角（DimensionType.timeOfDay）：0 = 正午前 6000 刻 */
const sunAngle = (tick: number) => {
  const d = (tick / 24000 - 0.25) % 1;
  const e = d < 0 ? d + 1 : d;
  const f = 0.5 - Math.cos(e * Math.PI) / 2;
  return (e * 2 + f) / 3;
};
/** 白天的亮度系数：cos(角·2π)·2 + 0.5，夹到 0～1 */
const dayBrightness = Math.min(1, Math.max(0, Math.cos(sunAngle(params.dayTick) * Math.PI * 2) * 2 + 0.5));

/** 往灰里拉：c 往 亮度(c)·灰 混 k（getSkyColor、getCloudColor 下雨、打雷那两步都是这个形状） */
const desaturate = (c: RGB, grayLevel: number, k: number): RGB => {
  const g = luminance(c) * grayLevel;
  return [c[0] * (1 - k) + g * k, c[1] * (1 - k) + g * k, c[2] * (1 - k) + g * k];
};

/** 天色：雨 = rainLevel、雷 = thunderLevel、闪 = skyFlashTime 那一刻（往 (0.8, 0.8, 1) 混 45%） */
export const weatherSky = (rain: number, thunder: number, flash = false): RGB => {
  let c: RGB = plainsSky.map((x) => x * dayBrightness) as unknown as RGB;
  if (rain > 0) c = desaturate(c, 0.6, rain * 0.75);
  if (thunder > 0) c = desaturate(c, 0.2, thunder * 0.75);
  if (flash) c = mix(c, hexToRgb(params.lightning.skyTint), params.lightning.skyMix);
  return c;
};

/** 云色（云顶，四面再乘 顶 1、东西 0.9、南北 0.8、底 0.7） */
export const cloudColor = (rain: number, thunder: number): RGB => {
  let c: RGB = [1, 1, 1];
  if (rain > 0) c = desaturate(c, 0.6, rain * 0.95);
  c = c.map((x) => x * (dayBrightness * 0.9 + 0.1)) as unknown as RGB;
  if (thunder > 0) c = desaturate(c, 0.2, thunder * 0.95);
  return c;
};

/** 雾色：平原雾色往天色拉 1 − (0.25 + 0.75·区块数/32)^0.25（12 区块 0.146），再乘 (1 − 0.5·雨)(1 − 0.5·雷) */
export const weatherFog = (rain: number, thunder: number, flash = false): RGB => {
  const skyPull = 1 - (0.25 + (0.75 * params.renderDistance) / 16 / 32) ** 0.25;
  const c = mix(plainsFog.map((x) => x * dayBrightness) as unknown as RGB, weatherSky(rain, thunder, flash), skyPull);
  const k = (1 - 0.5 * rain) * (1 - 0.5 * thunder);
  return c.map((x) => x * k) as unknown as RGB;
};

/** 仰角 θ（弧度）处的天：天幕在眼睛上方 天幕高 格，那一点离眼睛 天幕高 / sin θ，球形雾 smoothstep(0, 渲染距离)；地平线以下是雾色（同 场/2-新世界/世界.tsx 的 天色在） */
export const skyAt = (θ: number, skyRgb: RGB, fog: RGB): RGB => {
  if (θ <= 0) return fog;
  const t = Math.min(1, params.skyDomeHeight / Math.sin(θ) / params.renderDistance);
  return mix(skyRgb, fog, t * t * (3 - 2 * t));
};

/** 地形的雾（FOG_TERRAIN，柱形）：起 = 距离 − clamp(距离 / 10, 4, 64)，止 = 距离 */
export const terrainFog = { 起: params.renderDistance - Math.min(64, Math.max(4, params.renderDistance / 10)), 止: params.renderDistance } as const;
