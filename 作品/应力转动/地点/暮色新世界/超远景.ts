// 暮色超远景的试看开关（engine/core/试看.ts）：导入的地形外面拿暮色远景包兜底，雾放远。用户还没挑雾远多少（11-06 出预览），
// 没开时一切照现状：不读远景包，雾照 `clampFogToEdge` 压到导入范围的边以内。开法（anim still 前设）：
//   REMOTION_ANIM_TRIAL='{"暮色远景": {"雾远": 6000, "高度雾": 1}, "地形": ["暮色放大-1752-远景", "暮色放大-1752-远地标"]}'
// 雾远：巡航时雾的远端（米，现状是 3500），不再压到边以内（边外有远景了）；高度雾：暮色高度雾浓度的倍数（engine/light/暮色光照.tsx 的 `twilightHeightFog`）
import { 试看参数 } from '@engine/core/试看.ts';
import { TWILIGHT_CRUISE_FOG_FAR } from '@engine/light/暮色光照.tsx';

export const twilightDistantPack = '暮色放大-1752-远景';
export const twilightFarLandmarkPack = '暮色放大-1752-远地标'; // 远处地标周围的小块（sourcing/worlds/暮色放大-1752-远地标.toml）
export type 暮色远景试看 = { 雾远: number; 高度雾: number };
export const twilightDistantTrial = () => 试看参数<暮色远景试看>('暮色远景');

// 巡航的雾远端：没开照现状压到导入范围的边以内（同 一镜到底/画面.tsx、6-1-3/编排.ts 原来的写法）；
// 开了试看，巡航下限 3.5 公里（`TWILIGHT_CRUISE_FOG_FAR`）换成 雾远，起飞时放远的那一段按同样比例放大，最远到 雾远（远景包只铺到导入范围外 10 公里）
export const cruiseFogFar = (fogFar: number, edgeDist: () => number, clampToEdge: (far: number, edge: number) => number) => {
  const trial = twilightDistantTrial();
  return trial ? Math.min(trial.雾远, (fogFar * trial.雾远) / TWILIGHT_CRUISE_FOG_FAR) : clampToEdge(fogFar, edgeDist());
};
