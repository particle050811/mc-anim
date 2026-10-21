// 幽冥高塔：用取材 mod 的 mesh 动作从片场存档导出（含画、箱子等实体），实际比例（1 = 一格）。
// 导出（取材mod 目录下，暮色森林维度）：
//   ./mcai cam pos=536,200,244 pitch=90 yaw=180 dim=twilightforest:twilight_forest
//   ./mcai mesh from=481,0,177 to=591,185,311 out=../参考模型库/src/模型/场景/幽冥高塔.网格 mark=twilightforest:ur_ghast_boss_spawner
// 坐标：原点在导出范围底面中心，南 = -Y；范围见 幽冥高塔.网格.json。三个 幽冥高塔.网格.* 不要手改。
import React from 'react';
import { BlockMesh, BlockMeshInfo, fromGame } from '../../engine/voxel/方块网格.tsx';
import raw from 'asset:网格/幽冥高塔/头';
import bin from 'asset:网格/幽冥高塔/顶点';
import atlas from 'asset:网格/幽冥高塔/图集';

const INFO = raw as unknown as BlockMeshInfo;

export const DARK_TOWER = {
  spawner: fromGame(INFO.markers['twilightforest:ur_ghast_boss_spawner'][0]),
  size: [INFO.to[0] - INFO.from[0] + 1, INFO.to[2] - INFO.from[2] + 1, INFO.to[1] - INFO.from[1] + 1],
};

// hide：这些盒子里的面不画（一镜到底里撞开的洞，见 特效/方块飞溅.tsx）；clearPlants：这些矩形里不画花草
// hideBlocks：按方块藏（暮色新世界.tsx 的 地标核心外藏 放这里，不放 hide）；patchEdges：补边，地标默认开（见 lib/方块网格.tsx）
export const DarkTower: React.FC<{ hide?: number[][]; clearPlants?: number[][]; hideBlocks?: number[][]; patchEdges?: boolean | number }> = ({
  hide,
  clearPlants,
  hideBlocks,
  patchEdges = true,
}) => <BlockMesh info={INFO} bin={bin} atlas={atlas} hide={hide} clearPlants={clearPlants} hideBlocks={hideBlocks} patchEdges={patchEdges} />;
// 图集：碎块特效用同一张贴图
export const DarkTower_ATLAS = atlas;
