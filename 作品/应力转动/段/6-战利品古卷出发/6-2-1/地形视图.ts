// 6-2-1～6-2-3（BasePlanSegment，画面.tsx）、6-2-4（SetOff，出发.tsx）的地形视图：机位、航线同 FlightRig，地形是基地小岛（基地小岛视图.ts）
import type { SeqClock } from '@engine/core/拼段时序.ts';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { flightTerrainView } from '../../../地点/飞行机位.ts';
import { baseIslandVoxel, baseIslandWorld } from '../../../地点/基地小岛视图.ts';
import * as choreo from './编排.ts';
import * as choreo624 from '../6-2-4/编排.ts';

export const basePlanNear = 0.02;

/** 6-2-1～6-2-3：sec 是这条共用时间线的全局秒 */
export const basePlanTerrainView = (sec: number, clock: SeqClock, aspect: number): TerrainCanvasView[] => [
  flightTerrainView({ canvas: '主', world: baseIslandWorld, cam: choreo.camera(sec), near: basePlanNear, ahead: { sec, at: choreo.camera }, aspect, clock, ...baseIslandVoxel }),
];
/** 6-2-4：t 是段内秒 */
export const setOffTerrainView = (t: number, clock: SeqClock, aspect: number): TerrainCanvasView[] => [
  flightTerrainView({ canvas: '主', world: baseIslandWorld, cam: choreo624.camera(t), near: basePlanNear, ahead: { sec: t, at: choreo624.camera }, aspect, clock, ...baseIslandVoxel }),
];
