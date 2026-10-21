// 云中小屋：暮色森林高地上空巨人住的云屋（暮色森林 1.20.1-4.3.2508 troll_cave 结构里的 CloudCastleComponent + 两棵 CloudTreeComponent）。
// 用取材 mod 的 mesh 动作从片场存档导出（游戏渲染器实际画出来的面），尺寸是游戏实际比例（1 = 一格）。npm run 取材 -- 云中小屋 重新导出（要先开游戏）。
// 导出命令（取材mod 目录下，暮色森林维度；离世界原点最近的巨魔洞穴 /locate structure twilightforest:troll_cave → (296, ~, -263) 正上方那座）：
//   ./mcai cam pos=304,230,-264 pitch=90 yaw=180 dim=twilightforest:twilight_forest
//   ./mcai mesh from=254,158,-314 to=354,198,-214 out=../参考模型库/src/模型/场景/云中小屋.网格
// 巨人是生物，mesh 默认不导；要画巨人用 模型/角色/巨人.tsx，摆在 `CLOUD_COTTAGE.giants` 的位置上。
// 结构（反汇编 CloudCastleComponent.postProcess，和导出的网格核对过）：
// - 云岛：fluffy_cloud（实心）和 wispy_cloud（半透明）铺成约 96×96 格、8 格厚，顶面在游戏 y=168（巨人站的地面），离正下方地面约 143 格；云屋中心固定在 y=168。
// - 小屋：16×16 格见方（巨石块墙 12 格高 + 巨木屋顶 4 格），墙厚 4 格，屋里只有 8×8×12 格；门在西墙正中偏北，4 宽 8 高。巨人矿工生成在屋里 (14,4,14)、武装巨人 (17,4,17)（结构本地坐标）。
// - 两棵云树（giant_log 树干 + giant_leaves 树冠，顶到 y=196）在小屋北边一左一右。
// 坐标：原点在导出范围底面中心（游戏 304.5, 158, -263.5），南 = -Y，Z 朝上；三个 云中小屋.网格.* 文件不要手改。
import React from 'react';
import { BlockMesh, BlockMeshInfo, fromGame } from '../../engine/voxel/方块网格.tsx';
import type { V3 } from '../../engine/model/parts.tsx';
import raw from 'asset:网格/云中小屋/头';
import bin from 'asset:网格/云中小屋/顶点';
import atlas from 'asset:网格/云中小屋/图集';

const INFO = raw as unknown as BlockMeshInfo;
// 游戏坐标 → 本网格的场景坐标
const gameToLocal = (x: number, y: number, z: number): V3 => {
  const [ox, oy, oz] = INFO.origin;
  return fromGame([x - ox, y - oy, z - oz]);
};

export const CLOUD_COTTAGE = {
  size: [INFO.to[0] - INFO.from[0] + 1, INFO.to[2] - INFO.from[2] + 1, INFO.to[1] - INFO.from[1] + 1],
  floor: gameToLocal(0, 168, 0)[2], // 云岛顶面（巨人、人站的地面）的高度：本地 z = 10
  groundBelow: 25 - 168, // 正下方地面相对云岛顶面的高度（-143 格）
  // 范围都是 [x0, y0, z0, x1, y1, z1]（本地场景坐标）
  island: [...gameToLocal(256, 160, -216), ...gameToLocal(352, 168, -312)], // 云岛（顶面有一两格高的云疙瘩）
  house: [...gameToLocal(288, 168, -256), ...gameToLocal(304, 184, -272)], // 小屋外形（墙到 z=22，屋顶到 26）
  inside: [...gameToLocal(292, 168, -260), ...gameToLocal(300, 180, -268)], // 屋里的空间（8×8×12）
  door: [...gameToLocal(288, 168, -264), ...gameToLocal(292, 176, -268)], // 西墙上的门洞（4 宽 8 高，穿过 4 格厚的墙）
  // 两个巨人：生成点（结构定的）和片场存档里现在站的位置（/data get 的，走动过）
  giants: {
    miner: { spawn: gameToLocal(294, 168, -266), now: gameToLocal(297.93, 168, -266.8) },
    armed: { spawn: gameToLocal(297, 168, -263), now: gameToLocal(294.86, 168, -265.29) },
  },
  trees: [gameToLocal(276, 168, -286), gameToLocal(322, 168, -282)], // 两棵云树树干的大致中心（树冠顶 z=38）
};

// hide：这些盒子里的面不画（一镜到底里撞开的洞，见 特效/方块飞溅.tsx）
// hideBlocks：按方块藏（暮色新世界.tsx 的 地标核心外藏 放这里，不放 hide）；patchEdges：补边，地标默认开（见 lib/方块网格.tsx）
export const CloudCottage: React.FC<{ hide?: number[][]; hideBlocks?: number[][]; patchEdges?: boolean | number }> = ({ hide, hideBlocks, patchEdges = true }) => (
  <BlockMesh info={INFO} bin={bin} atlas={atlas} hide={hide} hideBlocks={hideBlocks} patchEdges={patchEdges} />
);
// 图集：碎块特效用同一张贴图
export const CloudCottage_ATLAS = atlas;
