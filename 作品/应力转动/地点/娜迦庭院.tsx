// 娜迦庭院：用取材 mod 的 mesh 动作从片场存档导出，实际比例（1 = 一格），本体约 95×95 格、轮廓不是正方形。三个 娜迦庭院.网格.* 不要手改。
// 导出（取材mod 目录下，暮色森林维度，镜头先到庭院和西边直道的上空）：
//   ./mcai cam pos=180,120,496 pitch=90 yaw=180 dim=twilightforest:twilight_forest
//   ./mcai mesh from=0,-6,393 to=359,70,600 origin=264.5,5,488.5 out=../参考模型库/src/模型/场景/娜迦庭院.网格 'skip=fire,firefly,naga_boss_spawner,*chest*' mark=twilightforest:naga_boss_spawner,minecraft:fire,twilightforest:twilight_portal
// 火不导（这里用会动的 `Flame` 画），刷怪笼、萤火虫不导；庭院里本来有两个木箱（中心空地边上）不导，免得和斩杀后弹出的战利品箱混在一起。
// 庭院东边（x 31 往东）是黑暗森林，树冠连成近黑色的屋顶，是游戏里本来的样子，照导。
// 坐标：庭院中心在原点，草地表面 z=0（游戏 y=5；围墙顶约 z=7.5，树篱顶 z=6），南 = -Y。
// 范围：x -264.5～94.5、y -111.5～95.5。东、北两面带约 48 格地面和树；西面带到返回传送门再往西约 96 格（6-1-2 的助跑直道在这里；6-1-1 有从门东边朝西拍的镜头，只带 30 格时远处会露出平的垫地，地平线上一道黑边）。
// 片场存档在导出前改过（工具/游戏取材/开直道.py）：
// - 从庭院正西沿东西中轴（y≈0）开了一条 8 格宽的助跑直道，x≈-224 到水沟边 x -93，只砍挡路的树，草和花留着；水沟前的起跳区连树冠清空；
// - 直道上搭了暮色森林的返回传送门（场景中心 (-167.5, -0.5)，游戏 x 96～97、z 488～489，北边几格是一棵大树）：2×2 传送门方块，外圈草方块上一圈杂色花，照自动生成的返回传送门。
//   6-1-1 结尾二人从门里跃出落在门东边约 4 格的空地上，6-1-2 从落地处起跑，两段共用这个场景。人不能站在传送门方块上（会被传回去）。门以西那段直道没补树，就当林间小路。
//   用户 10-08 要门挪近一半：不回游戏重导（客户端装了夸克，重导会让整片庭院的草叶被 Greener Grass 调绿），在这里把网格里传送门连花圈那块原样搬到东边 33 格画，见 `挪门`。
// - 西边林地比庭院低一格（传送门一带草地在 z=-1），墙外有一道水沟（x -92～-66）。
import React, { useMemo } from 'react';
import { BlockMesh, type BlockMeshInfo, fromGame } from '@engine/voxel/方块网格.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { Flame } from './娜迦迷宫.tsx';
import raw from 'asset:网格/娜迦庭院/头';
import bin from 'asset:网格/娜迦庭院/顶点';
import atlas from 'asset:网格/娜迦庭院/图集';

const INFO = raw as unknown as BlockMeshInfo;
// 挪门：网格里的传送门 2×2 连外圈 4×4 的草方块和花（连下面那层泥土，门坑底是它的顶面）原样平移 `portalShift` 画到东边 33 格（游戏 x 128～131）；那里草地比旧门一带低一格，所以同时往下挪一格。
// 新位置原来的草面、花草按方块藏掉（`newPortalHide`）；旧门那块藏掉（`oldPortalHide`）后露的洞，抄东边 6 格直道上同样高的平草地补上（`patchSource`）。
// 网格里同一平面上相邻的面合并成了大面（直道草地顶面是长条），按面心判的 `hide` 会漏藏或连带藏一大片，所以藏、只画某一块都按方块（`hideBlocks`，跨盒子边的大面按格切开）；
// 只画一块 = 把这块以外的六个方向都按方块藏掉。盒子都是参考模型坐标，方块边界在 x、y 上是半格（原点 264.5、488.5）
const portalShift: V3 = [33, 0, -1];
const portalBox = [-169.5, -2.5, -1, -165.5, 1.5, 2]; // 游戏 x 95～98、z 487～490、y 4～6（花在 y 6）
const oldPortalHide = [-169.5, -2.5, 0, -165.5, 1.5, 2];
const newPortalHide = [portalBox[0] + portalShift[0], portalBox[1], -1, portalBox[3] + portalShift[0], portalBox[4], 1];
const patchShift: V3 = [-6, 0, 0];
const patchSource = [oldPortalHide[0] - patchShift[0], oldPortalHide[1], oldPortalHide[2], oldPortalHide[3] - patchShift[0], oldPortalHide[4], oldPortalHide[5]];
const farBound = 1e5;
const keepOnlyBox = ([x0, y0, z0, x1, y1, z1]: number[]): number[][] => [
  [-farBound, -farBound, -farBound, x0, farBound, farBound],
  [x1, -farBound, -farBound, farBound, farBound, farBound],
  [x0, -farBound, -farBound, x1, y0, farBound],
  [x0, y1, -farBound, x1, farBound, farBound],
  [x0, y0, -farBound, x1, y1, z0],
  [x0, y0, z1, x1, y1, farBound],
];
const portalKeepOnly = keepOnlyBox(portalBox);
const patchKeepOnly = keepOnlyBox(patchSource);
// 网格里（挪之前）返回传送门 2×2 的中心（传送门表面，比周围草地低 0.19 格）
function meshPortalCenter(): V3 {
  const ps = INFO.markers['twilightforest:twilight_portal'].map(fromGame);
  const center = ps.reduce((a, p) => [a[0] + p[0] / ps.length, a[1] + p[1] / ps.length, a[2] + p[2] / ps.length], [0, 0, 0]);
  return [center[0], center[1], center[2] + 0.8125];
}
// 返回传送门 2×2 的中心（挪过以后）
function NAGA_PORTAL_CENTER(): V3 {
  const center = meshPortalCenter();
  return [center[0] + portalShift[0], center[1] + portalShift[1], center[2] + portalShift[2]];
}
// 围墙外沿的范围（不含外面带的一圈地面）：游戏坐标 x 217～311、z 441～535
const BOUNDS = { x: [-47.5, 47.5], y: [-47.5, 47.5] };
const inside = ([x, y]: number[]) => x > BOUNDS.x[0] && x < BOUNDS.x[1] && y > BOUNDS.y[0] && y < BOUNDS.y[1];

export const NAGA_COURTYARD = {
  bounds: BOUNDS,
  spawner: fromGame(INFO.markers['twilightforest:naga_boss_spawner'][0]),
  fires: INFO.markers['minecraft:fire'].map(fromGame).filter(inside) as V3[],
  portal: NAGA_PORTAL_CENTER(),
};

// 返回传送门 2×2：游戏里是亮紫色、自发光的漩涡面，只比草地低 3/16 格（参照 预览/传送门/10-游戏-6-1-2首帧机位.png）。
// 方块里除了 13/16 高的紫色表面，还有一层贴着方块底的深绿半透明面（离底 0.11 格，按水色染色）。
// 深绿那层不能藏（藏了紫色表面会跟着暮色弱光打暗，透过它看到底下受光的泥土和背光内壁，像个深坑；用户 10-02 指出）：
// 按 方块网格.tsx 的 `glow` 画，紫色表面不受光照（游戏里亮度 11、露天），深绿那层照画、但先于紫色表面画。盒子按网格里的位置给（搬过去画的那份在平移之前算）
const PORTAL_GLOW = (() => {
  const [x, y, z] = meshPortalCenter();
  return [[x - 1.2, y - 1.2, z - 0.9, x + 1.2, y + 1.2, z + 0.1]];
})();

// t：时间（秒），驱动火焰闪动；clearPlants：这些矩形 [x0, y0, x1, y1] 里不画花草（角色跑位上的草会挡住腿）；
// hide：这些盒子里的面不画（各帧同一个数组，换了要重建网格）
// hideBlocks：按方块藏（暮色新世界.tsx 的 地标核心外藏 放这里，不放 hide）；patchEdges：补边，地标默认开（见 lib/方块网格.tsx）
export const NagaCourtyard: React.FC<{ t: number; clearPlants?: number[][]; hide?: number[][]; hideBlocks?: number[][]; patchEdges?: boolean | number }> = ({
  t,
  clearPlants,
  hide,
  hideBlocks,
  patchEdges = true,
}) => {
  const hiddenBlocks = useMemo(() => [...(hideBlocks ?? []), oldPortalHide, newPortalHide], [hideBlocks]);
  return (
    <group>
      <BlockMesh info={INFO} bin={bin} atlas={atlas} clearPlants={clearPlants} hide={hide} hideBlocks={hiddenBlocks} patchEdges={patchEdges} />
      <group position={portalShift}>
        <BlockMesh info={INFO} bin={bin} atlas={atlas} hideBlocks={portalKeepOnly} patchEdges={false} glow={PORTAL_GLOW} />
      </group>
      <group position={patchShift}>
        <BlockMesh info={INFO} bin={bin} atlas={atlas} hideBlocks={patchKeepOnly} patchEdges={false} />
      </group>
      {NAGA_COURTYARD.fires.map((p, i) => (
        <group key={i} position={p}>
          <Flame t={t} seed={i * 1.7} />
        </group>
      ))}
    </group>
  );
};
