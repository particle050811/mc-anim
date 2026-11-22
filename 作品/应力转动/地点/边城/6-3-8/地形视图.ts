// 6-3-8、6-3-10（7-4-3 借场景）这一帧体素世界的地形视图：机位、近裁面、相机在地下就不挂地形。
// 画面.tsx 照它摆相机、挂 VoxelWorld；段的 地形视图.ts 拿它给加载计划（engine/voxel/加载计划.ts）在 Node 里算，两边同一份
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { LevelParams } from '@engine/core/渲染级别.ts';
import { overworldFarM } from '@engine/voxel/主世界地形.ts';
import { placeFlightCamera } from '../../飞行机位.ts';
import { fallTerrainWorld } from '../6-3-下坠/地形世界.ts';
import * as fallChoreo from '../6-3-下坠/编排.ts';
import { camPose, type Cam } from './编排.ts';

export const pursuerNear = 0.02;
// FlightRig 的 far 默认值；视锥的远裁面也裁区段（视锥.ts），所以要和画面那台相机一样
export const pursuerFar = 150000;
export const pursuerUnder = (cam: Cam) => cam.pos[2] < fallChoreo.groundZ - 0.5;

export const pursuerTerrainView = (t: number, cam: Cam = camPose(t)): TerrainCanvasView[] =>
  pursuerUnder(cam)
    ? []
    : [
        {
          canvas: '主',
          world: fallTerrainWorld,
          place: (camera, aspect) => {
            placeFlightCamera(camera, cam, aspect, pursuerNear, pursuerFar);
            return cam.pos;
          },
          farM: overworldFarM,
          pixel: LevelParams.视频.pixel,
        },
      ];
