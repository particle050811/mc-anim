// 终焉高原城堡：用取材 mod 的 mesh 动作从片场存档分块导出（约 1 公里，27 块），实际比例（1 = 一格）。适合远景和大全景，近景只取局部时另导一小块。
// 只要外面看得到的（outside=1），去掉周围森林的树、草和一圈荆棘（荆棘单独就 440 万个面），去掉的方块见 `castleExportSkip`。城堡是空的，没有 boss 刷怪点（和剧情一致）。
// 导出（取材mod 目录下，暮色森林维度；skip= 后面是 `castleExportSkip` 用逗号连起来）：
//   ./mcai mesh from=-600,-14,-640 to=425,205,-325 outside=1 'skip=<城堡导出去掉>' out=../参考模型库/src/模型/场景/终焉高原城堡.网格
// 坐标：原点在导出范围底面中心，南 = -Y；范围见 终焉高原城堡.网格.json。三个 终焉高原城堡.网格.* 不要手改。
import React from 'react';
import { BlockMesh, type BlockMeshInfo } from '../../engine/voxel/方块网格.tsx';
import raw from 'asset:网格/终焉高原城堡/头';
import bin from 'asset:网格/终焉高原城堡/顶点';
import atlas from 'asset:网格/终焉高原城堡/图集';

const INFO = raw as unknown as BlockMeshInfo;

// 导出时 skip 掉的方块（mcai mesh 的 skip 写法：方块 id 冒号后面的部分，* 通配）。游戏里这些方块都在，网格范围里由导入的地形照样画（模型/场景/地貌导入预览.tsx 的 `留`），重导时改这里，两边跟着变
export const castleExportSkip = ['*thorns', '*leaves*', '*_log', '*_wood', 'grass', 'tall_grass', 'fern', 'large_fern', '*mushroom*', 'moss*', '*root*'];

export const FINAL_CASTLE = {
  size: [INFO.to[0] - INFO.from[0] + 1, INFO.to[2] - INFO.from[2] + 1, INFO.to[1] - INFO.from[1] + 1],
};

// 城堡里的暮色力场（顶上的紫色、内院的蓝绿粉几种，本地坐标 [x0, y0, z0, x1, y1, z1]）：游戏里自发光，不受光照（见 lib/方块网格.tsx 的 fullbright）。盒子里单面的半透明面只有力场
const forceFieldBoxes = [
  [333, 19, 176, 354, 40, 188],
  [280, -52, 68, 409, 31, 203],
  [331, 29, 68, 344, 50, 145],
  [342, -8, 68, 344, 73, 75],
];

// hide：这些盒子（本地坐标 [x0, y0, z0, x1, y1, z1]）里的面不画，各帧要是同一个数组（换了要重建网格）
// hideBlocks：按方块藏（暮色新世界.tsx 的 地标核心外藏 放这里，不放 hide）；patchEdges：补边，地标默认开（见 lib/方块网格.tsx）
export const FinalCastle: React.FC<{ hide?: number[][]; hideBlocks?: number[][]; patchEdges?: boolean | number }> = ({ hide, hideBlocks, patchEdges = true }) => (
  <BlockMesh info={INFO} bin={bin} atlas={atlas} hide={hide} hideBlocks={hideBlocks} patchEdges={patchEdges} fullbright={forceFieldBoxes} />
);
