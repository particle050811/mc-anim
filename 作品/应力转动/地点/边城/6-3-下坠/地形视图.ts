// 6-3 下坠这条时间线（6-3-1～6-3-7）的地形视图（engine/voxel/地形视图.ts）：机位、挂不挂地形、体素世界的参数，FallScene（场/6-边城/6-3-下坠/画面.tsx）和加载计划读同一份
import type { SeqClock } from '@engine/core/拼段时序.ts';
import { LevelParams } from '@engine/core/渲染级别.ts';
import { overworldFarM } from '@engine/voxel/主世界地形.ts';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { backToTown } from '../../../场/6-边城/6-3-1/编排.ts';
import { onBroomState } from '../../../场/6-边城/6-3-2/扫帚上.ts';
import { flightTerrainView } from '../../飞行机位.ts';
import { SUN_OW_DIR } from '../../主世界日向.ts';
import * as choreo from './编排.ts';
import * as timeline from './时间线.ts';
import { fallTerrainWorld } from './地形世界.ts';

export const fallNear = 0.02;
/** 体素世界的参数（far 同 useOverworldTerrain 的 farM） */
export const fallVoxel = { farM: overworldFarM, pixel: LevelParams.视频.pixel, shadowLightDir: SUN_OW_DIR };
// 6-3-1、6-3-2（T < 0）：机位、两人姿势、李樱手里的指南针换成 6-3-1/编排.ts、6-3-2/扫帚上.ts 的。
// 正好落在 6-3-1 止上的那一刻算 6-3-2（段表是累加出来的秒，1e-9 是浮点余量）
export const fallPreLeapAt = (s: number) => (s < timeline.segTable['6-3-1'].end - 1e-9 ? backToTown(s) : s < 0 ? onBroomState(s) : null);
export const fallCamAt = (T: number) => fallPreLeapAt(T)?.cam ?? choreo.camPose(T);
/** 镜头进了地下（竖井、古城）：不画地形 */
export const fallUnder = (cam: { pos: number[] }) => cam.pos[2] < choreo.groundZ - 0.5;

/** 全局秒 T 这一帧；clock 是画布所在那一层的时钟（航线定级从这一截的头算） */
export const fallTerrainView = (T: number, clock: SeqClock, aspect: number): TerrainCanvasView[] => {
  const cam = fallCamAt(T);
  if (fallUnder(cam)) return [];
  return [flightTerrainView({ canvas: '主', world: fallTerrainWorld, cam, near: fallNear, ahead: { sec: T, at: fallCamAt }, aspect, clock, ...fallVoxel })];
};
