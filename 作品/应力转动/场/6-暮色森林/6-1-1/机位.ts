// 6-1-1 进入森林的机位和地形视图：进入森林.tsx 的画面和加载计划（段的 地形视图.ts）读同一份。纯模块，不碰 React。
// 两块画布：海岛（主世界-116 的基地小岛）和暮色（娜迦庭院），按 编排.ts 的 world 换
import type * as THREE from 'three';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { islandToWorld } from '../../../地点/基地小岛.tsx';
import { baseIslandVoxel, baseIslandWorld } from '../../../地点/基地小岛视图.ts';
import { twilightViewParts } from '../../../地点/暮色新世界/地形世界.ts';
import { placeFlightCamera } from '../../../地点/飞行机位.ts';
import { courtyardLightDir, courtyardToWorld } from '../6-1-2/机位.ts';
import * as choreo from './编排.ts';

/** 编排时间 t 的机位（世界坐标）、近远裁面：暮色那半 2 公里，海岛那半 60 公里 */
export const enterForestCamera = (t: number) => {
  const c0 = choreo.camera(t);
  const tf = choreo.world(t) === 'tf';
  const toWorld = tf ? courtyardToWorld : islandToWorld;
  return { tf, pose: { ...c0, pos: toWorld(c0.pos), tgt: toWorld(c0.tgt) }, near: 0.05, far: tf ? 2000 : 60000 };
};
export const placeEnterForestCamera = (camera: THREE.PerspectiveCamera, t: number, aspect: number) => {
  const c = enterForestCamera(t);
  placeFlightCamera(camera, c.pose, aspect, c.near, c.far);
  return c.pose.pos;
};
// 暮色那半的 TwilightTerrain：主光同 6-1-2 的庭院，不开超远景
export const enterForestTwilight = { shadowLightDir: courtyardLightDir };

/** 段内第 sec 秒的地形视图。海岛那半是 基地小岛.tsx 的 BaseIslandTerrain，参数同它读 基地小岛视图.ts */
export const enterForestTerrainView = (sec: number): TerrainCanvasView[] => {
  const t = sec + choreo.T0;
  const place = (camera: THREE.PerspectiveCamera, aspect: number) => placeEnterForestCamera(camera, t, aspect);
  return enterForestCamera(t).tf
    ? [{ canvas: '6-1-1 暮色', place, ...twilightViewParts(enterForestTwilight) }]
    : [{ canvas: '6-1-1 海岛', place, world: baseIslandWorld, ...baseIslandVoxel }];
};
