// 基地小岛：李樱的基地和暮色传送门所在的海上小岛（6-1-1 主世界那一半、6-2-1～6-2-4）。
// 地形是主世界-116（种子 116、史诗地形 + 生成时修整，取材mod/数据包/主世界修整）预生成后导入的区段包，导入范围外用远景兜底（lib/体素/主世界地形.ts）；
// 基地工坊（基地工坊.tsx）和花圈水池摆在岛上，摆的地方把导入的方块挖掉。
// 坐标：游戏 (x, y, z) → 场景 (x − 24576, −4096 − z, y − 64)，原点和 gameToScene 用 主世界116.ts 的那一份；取到地形后核对，对不上直接报错。
// 岛：中心 (39680, −1216)，东西 310、南北 344 米，平原草地 y 64～72、一圈沙滩，四周是修整出来的海（30°～240° 方向 30 公里内没有陆地）。
// 基地（用户 10-05「按你推荐的来」，定在岛东南部 (39740, −1130)，窗外依次是草地、沙滩、海）：
//   房间本地 (0, 0, 0) = 方块 (39740, 69, −1130) 的西北角、地板顶面；本地格 (cx, cy, cz) = 方块 (39740 + cx, 69 + cz, −1131 − cy)。
//   不转：本地 +X 朝东、+Y 朝北，东墙、南墙的大窗正对东、南（修整时量「窗外 30 公里没有陆地」用的就是这两个朝向）。
//   占地（墙）x 39733～39746、z −1139～−1123。这块地面东南半边 y 68、西北半边 y 69，地板那层（本地 z = −1，y 68）正好铺在原地面上不用垫地基：
//   屋身占地从 y 68 往上挖掉，墙外一圈勒脚、挑檐、烟囱从 y 69 往上挖掉。东北角外 3 米的原生橡树（树冠离风车帆最近 2.6 米）和东墙外的小土沟都留着。
// 暮色传送门的花圈水池（6-1-1）：岛北岸草地上，2×2 的水是方块 x 39675～39676、z −1332～−1331（y 64），离基地 210 米。选在这里因为：
//   - 基地两扇大窗看不到（北墙线以北、东墙线以西，屋里哪个角度都看不到），是同一座岛上离基地最近的窗外看不到的海岸；
//   - 6-1-1 海岛镜头照原编排朝北拍（太阳在西北偏西、低低的），水池后面 6～10 米是沙滩、30 米外是海，构图不变；这片草地平（y 64），编排里的高度不用改。
//   水池的水面、花圈的虞美人、激活后的传送门方块还用 6-1-1 从片场存档导出的网格（传送门海岛.tsx，只留水面和花），整块平移过来；6-1-1 的编排还按原海岛本地坐标写，镜头加上 `islandOffset` 换到世界。
import React, { useEffect } from 'react';
import { cancelRender } from 'remotion';
import type { V3 } from '../../engine/model/parts.tsx';
import { LevelParams } from '../../engine/core/渲染级别.ts';
import { VoxelWorld } from '../../engine/voxel/世界.tsx';
import type { LandmarkCutout } from '../../engine/voxel/导入地形.ts';
import { useOverworldTerrain, overworldPack, overworldDistantPack, overworldWindowView } from '../../engine/voxel/主世界地形.ts';
import { overworldOrigin, gameToScene } from './主世界116.ts';

export const baseSite = { x: 39740, z: -1130, groundY: 68 };
// 房间本地 → 世界：只平移，不转（本地轴就是世界轴）
export const roomOrigin: V3 = gameToScene([baseSite.x, baseSite.groundY + 1, baseSite.z]);
export const roomHeading = 0;

// 水池 2×2 西北角那一块（游戏方块坐标）。传送门海岛 网格里的水池是方块 x 1372～1373、z 199～200（导出原点 (1373.5, 63, 192.5)，原点那一层 y 63）
const poolBlock = { x: 39675, z: -1332 };
export const islandOffset: V3 = [1373.5 + (poolBlock.x - 1372) - overworldOrigin[0], overworldOrigin[2] - 192.5 - (poolBlock.z - 199), 63 - overworldOrigin[1]];
export const islandToWorld = (p: number[]): V3 => [p[0] + islandOffset[0], p[1] + islandOffset[1], p[2] + islandOffset[2]];

const digTop = 319;
// 挖框在各帧要是同一个数组（use导入地形 的要求），放在模块顶层
const digBoxes: LandmarkCutout[] = [
  { from: [39733, 68, -1139], to: [39746, digTop, -1123] }, // 屋身（地板那层起）
  { from: [39732, 69, -1140], to: [39747, digTop, -1122] }, // 墙外一圈：勒脚、挑檐、门前、风车轴承
  { from: [39731, 69, -1126], to: [39731, digTop, -1125] }, // 烟囱伸出勒脚的那一列（本地 y -6～-5；10-12 西墙开门，烟囱从 y 4～5 挪过来）
  { from: [poolBlock.x, 64, poolBlock.z], to: [poolBlock.x + 1, digTop, poolBlock.z + 1] }, // 水池（水面用导出的网格）
  // 水池四周一片草坪：花圈上原来的草、两人站的地方、往镜头那边（南）几格的草都拔掉，只留地面方块（虞美人用导出的网格）。
  // 一格高的草会把腿和花圈前沿挡住；玩家在自家水池边拔过草也说得通
  { from: [poolBlock.x - 3, 65, poolBlock.z - 3], to: [poolBlock.x + 6, 66, poolBlock.z + 6], 留: ['grass_block', 'dirt', 'sand', 'stone', 'gravel'] },
];

// 地形只画到 主世界窗外.远（30 公里）：这几段镜头都在岛上贴着地面，雾用 主世界窗外.能见度（12 公里），30 公里外画了也看不见
export const BaseIslandTerrain: React.FC<{ camPos: number[] }> = ({ camPos: camPos }) => {
  const terrain = useOverworldTerrain(overworldPack, overworldDistantPack, digBoxes, undefined, '基地小岛');
  useEffect(() => {
    if (!terrain) return;
    const packOrigin = terrain.位置([0, 0, 0]);
    const expectedOrigin = gameToScene([0, 0, 0]);
    if (packOrigin.some((v, i) => Math.abs(v - expectedOrigin[i]) > 1e-6)) cancelRender(new Error(`基地小岛：区段包 ${overworldPack} 的原点变了（${packOrigin} ≠ ${expectedOrigin}），改 主世界116.ts 的 overworldOrigin`));
  }, [terrain]);
  if (!terrain) return null;
  return <VoxelWorld 键={terrain.键} 来源={terrain.来源} 中心={camPos} 像素={LevelParams.视频.像素} 远={overworldWindowView.远} 高度={terrain.高度} />;
};
