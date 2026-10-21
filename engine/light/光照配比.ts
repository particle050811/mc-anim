// 灯的配比：直射、天光、环境光、自发光各多强，暮色森林、主世界各一套。灯的颜色在 模型/场景/天空.tsx 的 `TWILIGHT`（实拍取色），这里只管强度。
// 暮色森林照 Photon 改成以直射为主（用户 10-04 定的光影方向），原来的配比画面是平的。
// 柔档：影子里暗约 45%，背光侧面约是顶面一半；中档：影子里暗约 60%。四项比例照光影方案，绝对值按「受光顶面亮度和原来一样」定。
// 柔档提亮：柔档四项一起乘 1.1，相当于只给受光的东西加曝光（雾色、天不变），影子深浅比例同柔档，抵掉柔档比改前平均暗的 10%。
// 暮色森林游戏里没有太阳（维度把时间固定在 13000），主光是艺术选择：方位同 6-1-2（东偏南），仰角压到 32°，影子是树高的 1.6 倍长。
import { useEffect } from 'react';
import { getInputProps } from 'remotion';
import type { V3 } from '../model/parts.tsx';

export type LightMix = {
  直射: number; // 主光（暮色是 SunLight，主世界是 DirectionalLight）强度
  天光: number; // 半球光强度
  环境光: number;
  自发光: number; // 方块材质的自发光 = 颜色 × 这个系数（三类方块材质共用，见下面的 自发光）
};

// 强档、硬档：用户嫌 4+5 对比度太小像开了夜视，所以影子里暗约 75%（强档）、85%（硬档）：天光、环境光、自发光往下压，直射往上提，受光顶面亮度大致不变
const presets: Record<'柔档' | '柔档提亮' | '中档' | '强档' | '硬档' | '黄昏', LightMix> = {
  柔档: { 直射: 4.3, 天光: 1.65, 环境光: 0.32, 自发光: 0.2 },
  柔档提亮: { 直射: 4.73, 天光: 1.815, 环境光: 0.352, 自发光: 0.22 },
  中档: { 直射: 5.9, 天光: 1.42, 环境光: 0.235, 自发光: 0.135 },
  强档: { 直射: 7.0, 天光: 0.9, 环境光: 0.12, 自发光: 0.07 },
  硬档: { 直射: 7.6, 天光: 0.55, 环境光: 0.07, 自发光: 0.04 },
  // 黄昏（10-07 试的，用户要黄昏落幕的光色）：主光换落日橙金色、压到地平线上 14°（影子拉长），影子里只剩偏冷的蓝紫天光，太阳那侧地平线加一圈暖色余晖（见 `twilightDusk`）。
  // 太阳只高 14°，林子里地面全在树影里，所以直射、天光、环境光都比原配比高（原配比下几乎像夜里）
  黄昏: { 直射: 8, 天光: 1.5, 环境光: 0.14, 自发光: 0.06 },
};
// 用黄昏档、光从南偏西 200° 来、天和雾一起换成黄昏的颜色（用户 10-07 定）。
// 比档用：命令行 --props='{"lightPreset":"柔档提亮"}' 盖掉
const presetOverride = (getInputProps() as { lightPreset?: keyof typeof presets }).lightPreset;
const presetName = presetOverride && presetOverride in presets ? presetOverride : '黄昏';
// 光倍：四项一起乘（相当于给受光的东西加曝光，天、雾不变，影子深浅的比例不变）。比亮度用：命令行 --props='{"lightGain":1.3}'
const gainOverride = (getInputProps() as { lightGain?: number }).lightGain;
// 天和灯全部 2.0（用户 10-08 定；天倍跟着取 2，见 `skyGain`）
const lightGain = typeof gainOverride === 'number' ? gainOverride : 2;
export const twilightMix: LightMix = Object.fromEntries(Object.entries(presets[presetName]).map(([k, value]) => [k, value * lightGain])) as LightMix;
// 黄昏的灯色（不是黄昏档时是 null，用 TWILIGHT）：主光、天光、地面反光、天上余晖的颜色，余晖强度；
// 雾色：雾和天边的底色（太阳那边再往 余晖 里褪，见 lib/高度雾.ts 的 `dirFog`）；天色：天空按仰角的颜色（同 TWILIGHT.sky，条数要一样）。
// 云也要染成黄昏色（用户 10-07），所以天边和雾整套换成落日后的天：天边暖桃色、往上灰玫瑰、紫，头顶深靛；背对太阳那边是偏灰的玫瑰色（维纳斯带）
// `skyGain`：天空渐变、雾色、余晖、云的颜色一起提亮（这些是直接写的颜色，不吃灯光，`lightGain` 乘不到）。
// 线性空间里乘，某个通道超过 1 就整体按比例压回去（色相、饱和度不变，天边不会冲成白的）。比用：--props='{"lightGain":2,"skyGain":1.5}'
const skyGainOverride = (getInputProps() as { skyGain?: number }).skyGain;
export const skyGain = typeof skyGainOverride === 'number' ? skyGainOverride : 2;
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
export const brighten = (hex: string, k = skyGain) => {
  if (k === 1) return hex;
  const channels = [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255) * k);
  const maxChannel = Math.max(1, ...channels);
  return '#' + channels.map((x) => Math.round(linearToSrgb(x / maxChannel) * 255).toString(16).padStart(2, '0')).join('');
};
const duskBase =
  presetName === '黄昏'
    ? {
        keyLight: '#ffa45c',
        skyLight: '#5f6cc0',
        groundLight: '#2a2638',
        afterglow: '#ff9a55',
        afterglowStrength: 0.9,
        fogColor: '#d6a79c',
        skyColors: [
          [0.0, '#e8b09a'],
          [0.12, '#d9a0a0'],
          [0.18, '#b98a9c'],
          [0.23, '#94779a'],
          [0.28, '#776592'],
          [0.36, '#544c7a'],
          [0.5, '#363459'],
          [1.0, '#1b1c35'],
        ] as [number, string][],
      }
    : null;
export const twilightDusk = duskBase && {
  ...duskBase,
  afterglow: brighten(duskBase.afterglow),
  fogColor: brighten(duskBase.fogColor),
  skyColors: duskBase.skyColors.map(([t, color]) => [t, brighten(color)] as [number, string]),
};
// 暮色主光的方向（指向光源，场景坐标 Z 朝上、北 = +Y）。黄昏档：南偏西（方位 200°），仰角 14°；
// 东偏南（方位 113°）时 4+5 往东飞迎着光、陆地全是背光面（用户 10-07）；200° 时往东飞的几程光从右侧来，起伏、影子最清楚。
// 比光向用：命令行 --props='{"lightAzimuth":113}'（度，0 = 北、顺时针）、--props='{"lightElevation":32}' 盖掉
const { lightAzimuth: azimuthOverride, lightElevation: elevationOverride } = getInputProps() as { lightAzimuth?: number; lightElevation?: number };
const sunElevDeg = typeof elevationOverride === 'number' ? elevationOverride : twilightDusk ? 14 : null;
const sunAzimuthDeg = typeof azimuthOverride === 'number' ? azimuthOverride : twilightDusk ? 200 : null;
// 方位、仰角（度）→ 指向光源的单位向量（场景坐标）
export const sunDirFromAngles = (azimuthDeg: number, elevDeg: number): V3 => {
  const azimuthRad = (azimuthDeg * Math.PI) / 180;
  const elevRad = (elevDeg * Math.PI) / 180;
  return [Math.cos(elevRad) * Math.sin(azimuthRad), Math.cos(elevRad) * Math.cos(azimuthRad), Math.sin(elevRad)];
};
export const twilightSunDir: V3 = sunAzimuthDeg !== null || sunElevDeg !== null ? sunDirFromAngles(sunAzimuthDeg ?? 113, sunElevDeg ?? 32) : [0.78, -0.33, 0.53];
// 命令行给了 光方位 / 光仰角 / 光倍 的时候，各镜头自己定的光向、强弱让位给命令行（比光向、比亮度时整段统一用命令行的值）
export const cliSunDir = typeof azimuthOverride === 'number' || typeof elevationOverride === 'number';
export const cliGain = typeof gainOverride === 'number';

// 主世界以直射为主（用户 10-15 定 C 档，同暮色 10-04 照 Photon 的方向）：影子里暗约七成；直射按太阳仰角 20° 补到受光顶面亮度和原来（3.2 / 1.3 / 0.5，太阳 45°）一样。
// 主世界所有镜头都用这一套（lib/主世界光照.tsx）
export const overworldMix: LightMix = { 直射: 8.4, 天光: 1.0, 环境光: 0.17, 自发光: 0.4 };

// 两类方块材质（lib/体素/材质.ts、lib/方块网格.tsx）共用的自发光系数，着色器里是同一个 uniform（selfLight）。
// 由灯组件按世界设（use自发光），灯卸下时回到主世界的值：Studio 里从暮色森林的镜头切到主世界、古城的镜头，不会带着暮色的值
export const selfLight = { value: overworldMix.自发光 };
export const useSelfLight = (k: number) => {
  selfLight.value = k;
  useEffect(
    () => () => {
      selfLight.value = overworldMix.自发光;
    },
    [],
  );
};
