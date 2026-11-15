// 基地小岛（基地小岛.tsx）摆基地工坊、花圈水池的地方，导入的主世界地形挖掉（游戏坐标）。纯数据，地形改动.ts 汇总它给 anim check 核保真范围。
import type { LandmarkCutout } from '@engine/voxel/导入地形.ts';

// 暮色传送门花圈水池 2×2 西北角那一块（游戏方块坐标），基地小岛.tsx 的 islandOffset 也按它摆
export const basePoolBlock = { x: 39675, z: -1332 };
const digTop = 319;
/** 基地小岛：基地工坊和花圈水池摆的地方挖掉 */
export const baseIslandDigBoxes: LandmarkCutout[] = [
  { from: [39733, 68, -1139], to: [39746, digTop, -1123] }, // 屋身（地板那层起）
  { from: [39732, 69, -1140], to: [39747, digTop, -1122] }, // 墙外一圈：勒脚、挑檐、门前、风车轴承
  { from: [39731, 69, -1126], to: [39731, digTop, -1125] }, // 烟囱伸出勒脚的那一列（本地 y -6～-5；10-12 西墙开门，烟囱从 y 4～5 挪过来）
  { from: [basePoolBlock.x, 64, basePoolBlock.z], to: [basePoolBlock.x + 1, digTop, basePoolBlock.z + 1] }, // 水池（水面用导出的网格）
  // 水池四周一片草坪：花圈上原来的草、两人站的地方、往镜头那边（南）几格的草都拔掉，只留地面方块（虞美人用导出的网格）。
  // 一格高的草会把腿和花圈前沿挡住；玩家在自家水池边拔过草也说得通
  { from: [basePoolBlock.x - 3, 65, basePoolBlock.z - 3], to: [basePoolBlock.x + 6, 66, basePoolBlock.z + 6], 留: ['grass_block', 'dirt', 'sand', 'stone', 'gravel'] },
];
