// 暮色超远景：导入的地形外面拿暮色远景包、远处地标的补充包兜底，雾放远，全进雾的远处融进天色（engine/light/高度雾.ts 的天色雾）。
// 用户 11-07 定 10 公里那档（预览 1107-0542-暮色超远景，「10km 修复」），只给两个飞行段：6-起飞（起飞后，6-1-3 起飞.tsx）、6-穿塔斩首领（一镜到底 画面.tsx 的 `Oner`）；
// 6-落地后 也画一镜到底，但不开，照旧。没开的镜头不读这两个包，雾照 `clampFogToEdge` 压到导入范围的边以内。
// 试看（engine/core/试看.ts）还能盖掉正式值，也能给没开的镜头打开：
//   REMOTION_ANIM_TRIAL='{"暮色远景": {"雾远": 6000, "高度雾": 1}, "地形": ["暮色放大-1752-远景", "暮色放大-1752-远地标"]}'
// 雾远：巡航时雾的远端（米，没开时是 3500），不再压到边以内（边外有远景了）；高度雾：暮色高度雾浓度的倍数（engine/light/暮色光照.tsx 的 `twilightHeightFog`）
import { 试看参数 } from '@engine/core/试看.ts';
import { TWILIGHT_CRUISE_FOG_FAR } from '@engine/light/暮色光照.tsx';

export const twilightDistantPack = '暮色放大-1752-远景';
export const twilightFarLandmarkPack = '暮色放大-1752-远地标'; // 远处地标周围的小块（sourcing/worlds/暮色放大-1752-远地标.toml）
export type 暮色超远景 = { 雾远: number; 高度雾: number };
// 规矩 暮色超远景雾（作品/应力转动/规矩.toml）
export const TWILIGHT_FAR_VIEW: 暮色超远景 = { 雾远: 10000, 高度雾: 0.35 };
export const twilightDistantTrial = () => 试看参数<暮色超远景>('暮色远景');
// 这一镜实际用的：试看 > 镜头自己给的正式值 > 不开
export const farViewOf = (official?: 暮色超远景) => twilightDistantTrial() ?? official;

// 巡航的雾远端：没开照现状压到导入范围的边以内（同 一镜到底/画面.tsx、6-1-3/编排.ts 原来的写法）；
// 开了，巡航下限 3.5 公里（`TWILIGHT_CRUISE_FOG_FAR`）换成 雾远，往上放远的那一段按同样比例放大，最远到 雾远（远景包只铺到导入范围外 10 公里）。
// 放进：0～1，比例从 1 渐到 雾远 / 3.5 公里（6-1-3 起飞那几帧跟着雾一起放，起飞前 0 = 林子里的雾不变）
export const cruiseFogFar = (fogFar: number, edgeDist: () => number, clampToEdge: (far: number, edge: number) => number, far: 暮色超远景 | undefined, ramp = 1) => {
  if (!far) return clampToEdge(fogFar, edgeDist());
  const scale = 1 + (far.雾远 / TWILIGHT_CRUISE_FOG_FAR - 1) * ramp;
  return Math.min(far.雾远, fogFar * scale);
};
// 高度雾倍数、天色雾比例（engine/light/暮色光照.tsx 的 TwilightLighting），放进 同上
export const farViewLighting = (far: 暮色超远景 | undefined, ramp = 1) => (far ? { heightFogScale: 1 + (far.高度雾 - 1) * ramp, skyFog: ramp } : { heightFogScale: 1, skyFog: 0 });
