// 巫妖怪塔：用取材 mod 的 mesh 动作从「巫妖片场」存档导出，实际比例（1 = 一格），merge=0 一格一个面（6-1-5 按面心藏墙洞）。
// 巫妖片场是从 取材客户端-远景 的「片场」复制的（取材客户端自己的「片场」是娜迦庭院的导出源，这一带草花对不上）。
// 塔外地面花草与暮色新世界同一处等高，群系 oak_savannah，做法见 工具/游戏取材/巫妖塔四周.py（暮色新世界.tsx 的摆法改了要重导）。
// 导出（参考模型库/ 下，游戏开着巫妖片场、先关 Greener Grass）：python3 工具/游戏取材/巫妖塔四周.py 导出 src/模型/场景/巫妖怪塔.网格
//   （= mcai mesh from=-43,0,209 to=42,95,261 origin=0,0,235.5 merge=0 mark=twilightforest:lich_boss_spawner）
// 坐标：原点 (0, 0, 235.5)，南 = -Y；范围见 巫妖怪塔.网格.json。三个 巫妖怪塔.网格.* 不要手改。
import React from 'react';
import { BlockMesh, BlockMeshInfo, fromGame } from '../../engine/voxel/方块网格.tsx';
import raw from 'asset:网格/巫妖怪塔/头';
import bin from 'asset:网格/巫妖怪塔/顶点';
import atlas from 'asset:网格/巫妖怪塔/图集';

const INFO = raw as unknown as BlockMeshInfo;

export const LICH_TOWER = {
  spawner: fromGame(INFO.markers['twilightforest:lich_boss_spawner'][0]),
  size: [INFO.to[0] - INFO.from[0] + 1, INFO.to[2] - INFO.from[2] + 1, INFO.to[1] - INFO.from[1] + 1],
};

// `hide`：这些盒子里的面不画（镜头里撞开的洞，见 特效/方块飞溅.tsx）；`clearPlants`：这些矩形里不画花草。
// `hideBlocks`：按方块藏（暮色新世界.tsx 的 `landmarkHideOutsideCore` 放这里，不放 `hide`）；`patchEdges`：补边，地标默认开（见 lib/方块网格.tsx）
export const LichTower: React.FC<{ hide?: number[][]; clearPlants?: number[][]; hideBlocks?: number[][]; patchEdges?: boolean | number }> = ({
  hide,
  clearPlants,
  hideBlocks,
  patchEdges = true,
}) => <BlockMesh info={INFO} bin={bin} atlas={atlas} hide={hide} clearPlants={clearPlants} hideBlocks={hideBlocks} patchEdges={patchEdges} />;
// 图集（碎块特效用同一张贴图）
export const LichTower_ATLAS = atlas;
