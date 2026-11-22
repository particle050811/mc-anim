// 7-4-3 报告的地形视图（engine/voxel/地形视图.ts）：只有镜头 1 坑口挂地形（PursuerScene 停在 6-3-10 末帧、机位换成 坑口.ts 的），屋里那几镜窗外的边城是网格，不挂体素世界
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { pursuerTerrainView } from '../../../地点/边城/6-3-8/地形视图.ts';
import { lastSec as lastSec6 } from '../../../地点/边城/6-3-8/编排.ts';
import * as choreo from './编排.ts';
import * as pit from './坑口.ts';

// 镜头 1：6-3-10 末帧那一刻的场景（碎块、竖井都停在那时候），人按段内秒动
export const pitSceneT = lastSec6;
export const inPitShot = (sec: number) => sec < choreo.shot1End;
export const reportTerrainView = (sec: number): TerrainCanvasView[] => (inPitShot(sec) ? pursuerTerrainView(pitSceneT, pit.pitCam(sec)) : []);
