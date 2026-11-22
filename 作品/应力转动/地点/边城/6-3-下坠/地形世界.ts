// 边城下坠几镜读的地形（地形.ts 的 useFallTerrain 和加载计划共用）
import { overworldPlanWorld } from '@engine/voxel/加载计划.ts';
import { overworldPackName } from '../../主世界116.ts';

export const fallPack = overworldPackName;
export const fallDistantPack = `${overworldPackName}-远景`;
export const fallTerrainWorld = overworldPlanWorld(fallPack, fallDistantPack);
