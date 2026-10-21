// 传送门海岛（6-1-1 进入森林的主世界一侧）：远海里的一座小岛，岛上搭了暮色传送门的花圈水池（现已只留水池，见 `只留水池`）。
// 用取材 mod 的 mesh 动作从片场存档导出，实际比例（1 = 一格）。岛在片场存档主世界 (1373, 192) 附近，约 45×40 格，草地比海面高 1～2 格。
// 水池是游戏里搭的：2×2 的水，下面垫泥土，外圈 12 格草方块上各种一朵虞美人。
// 导出（取材mod 目录下，主世界）：
//   ./mcai cam pos=1373,150,192 pitch=90 yaw=180 dim=minecraft:overworld
//   ./mcai mesh from=1293,40,112 to=1453,100,272 origin=1373.5,63,192.5 out=../参考模型库/src/模型/场景/传送门海岛.网格
//   传送门（激活后的 2×2 方块，另导一份，同一个原点），在水池里放 twilightforest:twilight_portal 后：
//   ./mcai mesh from=1372,64,199 to=1373,64,200 origin=1373.5,63,192.5 out=../参考模型库/src/模型/场景/暮色传送门.网格
//   游戏里扔钻石没触发激活，传送门方块是直接放进去的；外观和真的激活一样，闪电另画（特效/闪电.tsx）。
// 坐标：原点在岛中央、海平面高度（游戏 y=63），南 = -Y。海面 z≈-0.11，草地顶 z=1～2。导出范围 161×161 格，范围外补一圈纯色海面。这六个 .网格.* 不要手改。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { BlockMesh, BlockMeshInfo } from '../../engine/voxel/方块网格.tsx';
import { V3 } from '../../engine/model/parts.tsx';
import raw from 'asset:网格/传送门海岛/头';
import bin from 'asset:网格/传送门海岛/顶点';
import atlas from 'asset:网格/传送门海岛/图集';
import portalRaw from 'asset:网格/暮色传送门/头';
import portalBin from 'asset:网格/暮色传送门/顶点';
import portalAtlas from 'asset:网格/暮色传送门/图集';

const INFO = raw as unknown as BlockMeshInfo;
const PORTAL_INFO = portalRaw as unknown as BlockMeshInfo;
const HALF = 80.5;

export const PORTAL_ISLAND = {
  // 水池 2×2 的中心（水面上）：钻石落点、闪电劈下的位置
  pool: [-0.5, -7.5, 1.89] as V3,
  // 水池四角（不含花圈）：x -1.5..0.5、y -8.5..-6.5；花圈再往外一格
  poolRect: [-1.5, -8.5, 0.5, -6.5],
  grass: 2, // 水池一带草地顶面
  sea: -0.11,
};

const POOL_WATER = [[-1.6, -8.6, 1.8, 0.6, -6.4, 1.95]];
// 传送门方块里除了 13/16 高的紫色表面，还有一层贴着方块底、按水色染色的半透明面（z≈1.11）。半透明面不写深度、按导出顺序画，斜着看会盖在紫色表面上像门里露出水（用户 10-01 指出），
// 所以和暮色森林那边的返回传送门一样按 glow 画（方块网格.tsx）：紫色表面不受光自己发亮，蓝色那层先画垫在下面
const PORTAL_GLOW = [[-1.6, -8.6, 0.95, 0.6, -6.4, 1.95]];

// 导出范围外的海面：四块大平面围成一圈，与导出的水面同高，颜色取游戏里远处海面的蓝。只铺到 470 格（天空穹顶半径 480 以内），再远交给雾，否则天边切出一道硬边。
// 不受光照（低角度太阳下受光的平面会比带贴图的水面暗一截，接缝处一道深色带），颜色对着导出水面在渲染里的样子取
const Ocean: React.FC = () => {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#5277c4' }), []);
  const oceanExtent = 470;
  const rects: [number, number, number, number][] = [
    [-oceanExtent, HALF, oceanExtent, oceanExtent],
    [-oceanExtent, -oceanExtent, oceanExtent, -HALF],
    [-oceanExtent, -HALF, -HALF, HALF],
    [HALF, -HALF, oceanExtent, HALF],
  ];
  return (
    <group>
      {rects.map(([x0, y0, x1, y1], i) => (
        <mesh key={i} material={mat} position={[(x0 + x1) / 2, (y0 + y1) / 2, PORTAL_ISLAND.sea]}>
          <planeGeometry args={[x1 - x0, y1 - y0]} />
        </mesh>
      ))}
    </group>
  );
};

// 只留水池：6-1-1 的花圈水池搬到了基地小岛上（基地小岛.tsx），岛、海、树都用导入的真实地形，这份网格只留水池水面和花圈上的 12 朵虞美人：
// 花圈外面整个藏掉；花圈里面藏掉草方块顶面（z = 2）和水面以下的面（坑壁坑底由地形画，地形在水池那 2×2 格挖掉）。水面中心 z 1.89、虞美人中心 z 2.5 左右，都不在藏的盒子里
const hideFar = 1e4;
const RING = [-2.5, -9.5, 1.5, -5.5]; // 花圈外沿（水池再往外一格）
const outsidePool: number[][] = [
  [-hideFar, -hideFar, -hideFar, RING[0], hideFar, hideFar],
  [RING[2], -hideFar, -hideFar, hideFar, hideFar, hideFar],
  [RING[0] - 0.01, -hideFar, -hideFar, RING[2] + 0.01, RING[1], hideFar],
  [RING[0] - 0.01, RING[3], -hideFar, RING[2] + 0.01, hideFar, hideFar],
  [RING[0] - 0.01, RING[1] - 0.01, -hideFar, RING[2] + 0.01, RING[3] + 0.01, 1.85],
  [RING[0] - 0.01, RING[1] - 0.01, 1.95, RING[2] + 0.01, RING[3] + 0.01, 2.1],
];
const HIDE = { 全: undefined, 激活: POOL_WATER, 只留水池: outsidePool, 只留水池激活: [...outsidePool, ...POOL_WATER] };

// active：传送门是否已经激活（水面换成紫色传送门）；clearPlants 同 BlockMesh；只留水池：见上面 水池外
export const PortalIsland: React.FC<{ active?: boolean; clearPlants?: number[][]; poolOnly?: boolean }> = ({ active = false, clearPlants, poolOnly: poolOnly = false }) => (
  <group>
    <BlockMesh info={INFO} bin={bin} atlas={atlas} clearPlants={clearPlants} hide={HIDE[poolOnly ? (active ? '只留水池激活' : '只留水池') : active ? '激活' : '全']} />
    {active && <BlockMesh info={PORTAL_INFO} bin={portalBin} atlas={portalAtlas} glow={PORTAL_GLOW} />}
    {!poolOnly && <Ocean />}
  </group>
);
