// 正片台地场的机位：画幅、镜头表（按段内秒切）、跟拍样条，和摆相机、挂真下界的地形视图。纯模块：台地场.tsx 照它摆相机，各段的 地形视图.ts 拿它给加载计划，两边同一份。
import type * as THREE from 'three';
import { rigSpline, type Cam } from '@engine/core/机位.ts';
import { placeCamera } from '@engine/core/three换算.ts';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { netherBrighter, netherCameraFar, realNetherView } from '../../地点/真下界视图.ts';

export const aspect = { width: 1280, height: 720 } as const;

export const placeTerraceCamera = (camera: THREE.PerspectiveCamera, cameraRig: Cam) => placeCamera(camera, cameraRig, aspect.width / aspect.height, { near: 0.05, far: netherCameraFar(netherBrighter) });

/** 这一帧的地形视图：台地场总挂真下界（提亮那套光），镜头在机位上 */
export const terraceTerrainView = (cameraRig: Cam): TerrainCanvasView[] => [realNetherView(cameraRig.pos, netherBrighter, (camera) => placeTerraceCamera(camera, cameraRig))];

/** 跟拍：镜头里每隔约 步 秒按那一刻人在哪摆一个机位（摆(镜内秒, 进度)），连成速度连续的样条，镜头跟着动作走。镜头长 长 秒 */
export const followShot = (lengthSec: number, cameraPath: (shotSec: number, k: number) => Cam, stepSec = 0.25): Shot['cameraRig'] => {
  const n = Math.max(1, Math.ceil(lengthSec / stepSec));
  const keyframes = Array.from({ length: n + 1 }, (_, i) => {
    const s = (lengthSec * i) / n;
    return [s, cameraPath(s, i / n)] as const;
  });
  return (_u, s) => rigSpline(keyframes, s);
};

/** 一幕里的镜头表：按段内秒切，机位是镜头内进度 u（0～1）的函数 */
export type Shot = { name: string; start: number; cameraRig: (u: number, sec: number) => Cam };
export const pickShot = (shotTable: readonly Shot[], sec: number, segLengthSec: number): { shot: Shot; cameraRig: Cam; shotSec: number } => {
  let i = 0;
  while (i + 1 < shotTable.length && sec >= shotTable[i + 1]!.start) i++;
  const shot = shotTable[i]!;
  const end = shotTable[i + 1]?.start ?? segLengthSec;
  const shotSec = sec - shot.start;
  return { shot, cameraRig: shot.cameraRig(Math.min(1, Math.max(0, shotSec / (end - shot.start))), shotSec), shotSec };
};
