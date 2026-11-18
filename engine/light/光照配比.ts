// 灯的配比：直射、天光、环境光、自发光各多强，暮色森林、主世界各一套；暮色的黄昏灯色、天色、雾色也在这里（`twilightDusk`），游戏里实拍取的原色在 天空.tsx 的 `TWILIGHT`。
// 暮色森林照 Photon 改成以直射为主（用户 10-04 定的光影方向），原来的配比画面是平的。
// 暮色森林游戏里没有太阳（维度把时间固定在 13000），主光是艺术选择。
import type { V3 } from '../model/parts.tsx';
import { useWriter, newWriteSlot } from '../core/写入者.ts';

export type LightMix = {
  direct: number; // 主光（暮色是 SunLight，主世界是 DirectionalLight）强度
  skylight: number; // 半球光强度
  ambient: number;
  selfLight: number; // 方块材质的自发光 = 颜色 × 这个系数（三类方块材质共用，见下面的 自发光）
};

// 暮色森林用黄昏档（10-07 试的，用户要黄昏落幕的光色；10-07 定用它，光从南偏西 200° 来、天和雾一起换成黄昏的颜色）：
// 主光换落日橙金色、压到地平线上 14°（影子拉长），影子里只剩偏冷的蓝紫天光，太阳那侧地平线加一圈暖色余晖（见 `twilightDusk`）。
// 太阳只高 14°，林子里地面全在树影里，所以直射、天光、环境光都比原配比高（原配比下几乎像夜里）。别的档（柔档～硬档）在 灯光档位.ts
const duskMix: LightMix = { direct: 8, skylight: 1.5, ambient: 0.14, selfLight: 0.06 };
// 光倍：四项一起乘（相当于给受光的东西加曝光，天、雾不变，影子深浅的比例不变）。天和灯全部 2.0（用户 10-08 定；天倍跟着取 2，见 `skyGain`）
const lightGain = 2;
export const twilightMix: LightMix = Object.fromEntries(Object.entries(duskMix).map(([k, value]) => [k, value * lightGain])) as LightMix;
// 黄昏的灯色：主光、天光、地面反光、天上余晖的颜色，余晖强度；
// 雾色：雾和天边的底色（太阳那边再往 余晖 里褪，见 lib/高度雾.ts 的 `dirFog`）；天色：天空按仰角的颜色（同 TWILIGHT.sky，条数要一样）。
// 云也要染成黄昏色（用户 10-07），所以天边和雾整套换成落日后的天：天边暖桃色、往上灰玫瑰、紫，头顶深靛；背对太阳那边是偏灰的玫瑰色（维纳斯带）
// `skyGain`：天空渐变、雾色、余晖、云的颜色一起提亮（这些是直接写的颜色，不吃灯光，`lightGain` 乘不到）。
// 线性空间里乘，某个通道超过 1 就整体按比例压回去（色相、饱和度不变，天边不会冲成白的）
export const skyGain = 2;
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
export const brighten = (hex: string, k = skyGain) => {
  if (k === 1) return hex;
  const channels = [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255) * k);
  const maxChannel = Math.max(1, ...channels);
  return '#' + channels.map((x) => Math.round(linearToSrgb(x / maxChannel) * 255).toString(16).padStart(2, '0')).join('');
};
const duskBase = {
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
};
export const twilightDusk = {
  ...duskBase,
  afterglow: brighten(duskBase.afterglow),
  fogColor: brighten(duskBase.fogColor),
  skyColors: duskBase.skyColors.map(([t, color]) => [t, brighten(color)] as [number, string]),
};
// 方位、仰角（度）→ 指向光源的单位向量（场景坐标）
export const sunDirFromAngles = (azimuthDeg: number, elevDeg: number): V3 => {
  const azimuthRad = (azimuthDeg * Math.PI) / 180;
  const elevRad = (elevDeg * Math.PI) / 180;
  return [Math.cos(elevRad) * Math.sin(azimuthRad), Math.cos(elevRad) * Math.cos(azimuthRad), Math.sin(elevRad)];
};
// 暮色主光的方向（指向光源，场景坐标 Z 朝上、北 = +Y）：南偏西（方位 200°，0 = 北、顺时针），仰角 14°；
// 东偏南（方位 113°）时 4+5 往东飞迎着光、陆地全是背光面（用户 10-07）；200° 时往东飞的几程光从右侧来，起伏、影子最清楚。
export const twilightSunDir: V3 = sunDirFromAngles(200, 14);

// 主世界以直射为主（用户 10-15 定 C 档，同暮色 10-04 照 Photon 的方向）：影子里暗约七成；直射按太阳仰角 20° 补到受光顶面亮度和原来（3.2 / 1.3 / 0.5，太阳 45°）一样。
// 主世界所有镜头都用这一套（lib/主世界光照.tsx）
export const overworldMix: LightMix = { direct: 8.4, skylight: 1.0, ambient: 0.17, selfLight: 0.4 };

// 两类方块材质（lib/体素/材质.ts、lib/方块网格.tsx）共用的自发光系数，着色器里是同一个 uniform（selfLight）。
// 由灯组件按世界设（use自发光），灯卸下时回到主世界的值：Studio 里从暮色森林的镜头切到主世界、古城的镜头，不会带着暮色的值
export const selfLight = { value: overworldMix.selfLight };
const selfLightSlot = newWriteSlot();
const restoreOverworldEmissive = () => {
  selfLight.value = overworldMix.selfLight;
};
export const useSelfLight = (k: number) => {
  useWriter(selfLightSlot, restoreOverworldEmissive);
  selfLight.value = k;
};
// 发光方块（engine/voxel/方块发光.ts）的自发光倍数：体素材质里 贴图色 × 发光强度 × 这个数，和 自发光 取大的。默认 0（主世界、暮色画面不变），
// 世界自己开（下界，作品/亚波伦不放水/地点/真下界.tsx）；卸下时回 0
export const blockGlow = { value: 0 };
const blockGlowSlot = newWriteSlot();
const resetBlockGlow = () => {
  blockGlow.value = 0;
};
export const useBlockGlow = (k: number) => {
  useWriter(blockGlowSlot, resetBlockGlow);
  blockGlow.value = k;
};
