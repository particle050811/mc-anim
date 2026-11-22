// 6-2-5 飞越主世界、6-2-6 边城在望这条航线的地形视图（engine/voxel/地形视图.ts）：FlightView（飞越主世界.tsx）和加载计划读同一份
import type { SeqClock } from '@engine/core/拼段时序.ts';
import { LevelParams } from '@engine/core/渲染级别.ts';
import { overworldFarM } from '@engine/voxel/主世界地形.ts';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { flightTerrainView } from '../../飞行机位.ts';
import { SUN_OW_DIR } from '../../主世界日向.ts';
import { fallTerrainWorld } from '../6-3-下坠/地形世界.ts';
import * as choreo from './编排.ts';

export const flyoverNear = 0.02;
// 6-2-5、6-2-6 是同一条航线上接着的两截
export const flyoverSpan = [choreo.segmentTable['6-2-5'].start, choreo.segmentTable['6-2-6'].end] as const;
/** 体素世界的参数（far 同 useOverworldTerrain 的 farM；试看 trialFarM 只在页面上盖） */
export const flyoverVoxel = { farM: overworldFarM, pixel: LevelParams.视频.pixel, shadowLightDir: SUN_OW_DIR };

/** T：编排.ts 的全局秒；clock 是画布所在那一层的时钟 */
export const flyoverTerrainView = (T: number, clock: SeqClock, aspect: number): TerrainCanvasView[] => [
  flightTerrainView({ canvas: '主', world: fallTerrainWorld, cam: choreo.camera(T), near: flyoverNear, ahead: { sec: T, at: choreo.camera, range: flyoverSpan }, aspect, clock, ...flyoverVoxel }),
];
