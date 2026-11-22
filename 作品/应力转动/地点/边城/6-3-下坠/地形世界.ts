// 第 3 场（边城、下坠、追兵）的体素世界读哪个地形，纯数据：地形.ts 的 useFallTerrain 照它取，各段的地形视图（加载计划）照它在 Node 里搭选级用的地形源
import type { TerrainWorld } from '@engine/voxel/地形视图.ts';
import { overworldPackName } from '../../主世界116.ts';

export const fallTerrainWorld: TerrainWorld = { kind: '主世界', pack: overworldPackName, distant: `${overworldPackName}-远景` };
