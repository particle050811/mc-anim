// 主世界统一的太阳、天、空气雾和云（用户 10-15 定：主世界所有镜头一套，各镜头不自己拼；暮色那套在 lib/暮色光照.tsx）。
// - 太阳 `SUN_OW`；灯的配比是 lib/光照配比.ts 的 `overworldMix`（飞行镜头.tsx 的 `FlightSky`、天空.tsx 的 `SunLight` 都用它）。
// - 天、雾、云：Photon（lib/大气.ts、lib/大气/云.ts），`OverworldSky` 放进画布打开；`FlightSky` 自带，自己摆灯的镜头（6-3 下坠、7-4、6-1-1 海岛）单放。
//   云画在 <ScreenAo /> 的中间一遍，画布要挂它。坐标都是主世界-116 的场景坐标（z = 游戏 y − 64）。
import React from 'react';
import { Atmosphere } from '../../engine/light/大气.ts';
import { PhotonClouds } from '../../engine/light/大气/云.ts';
import { borderTownPos } from './主世界116.ts';

// 正西、仰角 20°（用户 10-15 定）：6-2-5 航线一路往西，太阳在前方、画面上方，逆光，影子朝镜头拉长
export const SUN_OW: [number, number, number] = [-0.94, 0, 0.342];
// 太阳投影用的光向（单位向量，体素地形的投影网格和日光要同一个，见 lib/飞行镜头.tsx 的 `OverworldSunLight`）
const sunLen = Math.hypot(...SUN_OW);
export const SUN_OW_DIR: [number, number, number] = [SUN_OW[0] / sunLen, SUN_OW[1] / sunLen, SUN_OW[2] / sunLen];

// 6-3 下坠穿过的那一片（用户 10-14：云照视频，下降时加一朵就行），在高积云层（6-3-4 跟拍穿过）：下坠路线在城局部 (0, 119) → (−0.5, 100.5)
const fallCloud: [number, number, number] = [borderTownPos[0], borderTownPos[1] + 110, 150];
// 边城上空让开一块（用户 10-14：云挡视线就删掉），加的那一片不让
const townClear: [number, number, number, number] = [borderTownPos[0], borderTownPos[1], 350, 150];
// 海平面 y 63
const seaY = 63 - 64;

export const OverworldSky: React.FC = () => (
  <>
    <Atmosphere sun={SUN_OW} far={40000} />
    <PhotonClouds add={[fallCloud]} clear={townClear} seaY={seaY} />
  </>
);
