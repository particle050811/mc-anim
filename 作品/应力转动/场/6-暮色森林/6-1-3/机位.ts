// 6-1-3 起飞的机位和地形视图：起飞.tsx 的画面和加载计划（段的 地形视图.ts）读同一份。纯模块，不碰 React。
import { twilightSunDir } from '@engine/light/光照配比.ts';
import type { SeqClock } from '@engine/core/拼段时序.ts';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { flightTerrainView } from '../../../地点/飞行机位.ts';
import { twilightViewParts } from '../../../地点/暮色新世界/地形世界.ts';
import * as choreo from './编排.ts';

/** 段内秒 t 的机位：编排是庭院本地坐标，加上庭院原点换成世界坐标 */
export const takeOffCamera = (t: number) => {
  const local = choreo.camera(t);
  const origin = choreo.courtyard.origin;
  const toWorld = (p: number[]) => [p[0] + origin[0], p[1] + origin[1], p[2] + origin[2]];
  return { ...local, pos: toWorld(local.pos), tgt: toWorld(local.tgt) };
};
// TwilightTerrain 的参数：起飞后开超远景（编排.ts 的 farView）
export const takeOffTwilight = () => ({ shadowLightDir: twilightSunDir, farView: choreo.farView() });

/** FlightRig 不给航线、用默认近远裁面 */
export const takeOffTerrainView = (clock: SeqClock, aspect: number): TerrainCanvasView[] => [
  flightTerrainView({ canvas: '6-1-3', cam: takeOffCamera(clock.sec), aspect, clock, ...twilightViewParts(takeOffTwilight()) }),
];
