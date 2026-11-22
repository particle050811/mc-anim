// 一镜到底画面（画面.tsx 的 OnerFrame，6-穿塔斩首领、6-落地后）的机位、航线和地形参数：画面和加载计划（段的 地形视图.ts）读同一份。纯模块，不碰 React。
import { LevelParams, type RenderLevel } from '@engine/core/渲染级别.ts';
import { twilightSunDir } from '@engine/light/光照配比.ts';
import type { SeqClock } from '@engine/core/拼段时序.ts';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { flightTerrainView } from '../../../地点/飞行机位.ts';
import { twilightViewParts } from '../../../地点/暮色新世界/地形世界.ts';
import { farViewOf, twilightFarViewM, TWILIGHT_FAR_VIEW, type TwilightFarView } from '../../../地点/暮色新世界/超远景.ts';
import { cameraAt, type Cam } from './镜头.ts';

export type OnerAhead = { sec: number; at: (sec: number) => Cam };
/** 机位：给了就用它（核对用的静帧），不给按 镜头.ts；航线：给了机位又没给航线就不往后看 */
export const onerShot = (g: number, camOverride?: Cam, ahead: OnerAhead | undefined = camOverride ? undefined : { sec: g, at: cameraAt }) => ({ cam: camOverride ?? cameraAt(g), ahead });

/** 这一级的门槛、最远（超远景开着时最远按 twilightFarViewM 收），和交给 TwilightTerrain 的参数 */
export const onerTerrain = (o: { farView?: TwilightFarView; level?: RenderLevel } & Partial<LevelParams>) => {
  const { farView, level = '视频', ...overrides } = o;
  const far = farViewOf(farView);
  const { pixel, far: farLevel, dpr } = { ...LevelParams[level], ...overrides };
  const farDist = far ? twilightFarViewM(farLevel) : farLevel;
  return { far, farDist, dpr, twilight: { pixel, far: farDist, shadowLightDir: twilightSunDir, farView } };
};

/** OnerFrame 那块画布的地形视图（机位、航线同 FlightRig 的默认近远裁面） */
export const onerTerrainView = (o: { g: number; cam?: Cam; ahead?: OnerAhead; farView?: TwilightFarView; aspect: number; clock: SeqClock }): TerrainCanvasView[] => {
  const { cam, ahead } = onerShot(o.g, o.cam, o.ahead);
  return [flightTerrainView({ canvas: '一镜到底', cam, ...(ahead ? { ahead } : {}), aspect: o.aspect, clock: o.clock, ...twilightViewParts(onerTerrain({ farView: o.farView }).twilight) })];
};

// 6-穿塔斩首领 那一截（画面.tsx 的 OnerSegment）开超远景（用户 11-07 只定了两个飞行段，6-落地后 不开）
export const onerSegmentFarView = TWILIGHT_FAR_VIEW;
