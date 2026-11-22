// 基地小岛几镜（6-2-1～6-2-4、7-4-3 窗外）的地形：BaseIslandTerrain（基地小岛.tsx）和地形视图（加载计划）读同一份
import { LevelParams } from '@engine/core/渲染级别.ts';
import { overworldDistantPack, overworldPack, overworldWindowView } from '@engine/voxel/主世界地形.ts';
import { overworldPlanWorld } from '@engine/voxel/加载计划.ts';

export const baseIslandPack = overworldPack;
export const baseIslandDistantPack = overworldDistantPack;
export const baseIslandWorld = overworldPlanWorld(baseIslandPack, baseIslandDistantPack);
// 地形只画到 overworldWindowView.farM（30 公里）：这几段镜头都在岛上贴着地面，远雾在 30 公里拉满成天色，再远画了也看不见（试看 trialFarM 只在页面上盖）
export const baseIslandVoxel = { farM: overworldWindowView.farM, pixel: LevelParams.视频.pixel };
