// 隐世之境一楼主厅通屋外的两扇门（结构 hidden_retreat_1 的模板坐标）：
// - 西门：模板 (6, 1..2, 10) 的深色橡木单开门（facing east、hinge left），门外是西边的石子路，进门正对着东墙那扇窗；第 15 句你从这里推门进来。
// - 北门：模板 (11..12, 1..2, 6) 的金合欢木双开门（facing north，左扇 hinge left、右扇 hinge right），门外是北院（锻台、灶台）；章 1 一楼机位里在她身后。
// 网格里门都是关着的。这里把关着的门扇从一楼网格里藏掉，再用同一份网格只留门扇的面、绕门轴转开：贴图、AO 都是游戏导出的原样。
// 转开的终点照 1.20.1 DoorBlock.getShape（开着时门扇贴在门洞那格的一边、占满进深），关和开两个位置之间按刚体转 90°，转轴在门扇厚度中线上（由两个位置推出来）。
// 坐标同 地点/隐世之境一楼.tsx（网格本地，Z 朝上：x 东、y 北、z 上）。
// 草色：默认用换成归隐之地草色的那份顶点（网格/隐世之境一楼/顶点-归隐之地，只换了群系染的颜色），'原样' 是片场存档主世界的草色。
import React from 'react';
import { BlockMesh, type BlockMeshInfo } from '@engine/voxel/方块网格.tsx';
import houseRaw from 'asset:网格/隐世之境一楼/头';
import houseBin from 'asset:网格/隐世之境一楼/顶点';
import retreatBin from 'asset:网格/隐世之境一楼/顶点-归隐之地';
import houseAtlas from 'asset:网格/隐世之境一楼/图集';
import { mainHall, mainHallDoors, type Box, type Leaf, type DoorName } from './隐世之境主厅门数据.ts';

export { mainHall, mainHallDoors, openDoorOpening, type DoorName } from './隐世之境主厅门数据.ts';

const houseInfo = houseRaw as unknown as BlockMeshInfo;

// 盒 B 以外的全部空间（6 块，互相有重叠没关系）：用 hide 藏掉它们就只剩 B 里的面
const keepOnly = ([x0, y0, z0, x1, y1, z1]: Box): Box[] => {
  const R = 1e3;
  return [
    [-R, -R, -R, x0, R, R],
    [x1, -R, -R, R, R, R],
    [x0 - 1, -R, -R, x1 + 1, y0, R],
    [x0 - 1, y1, -R, x1 + 1, R, R],
    [x0 - 1, y0 - 1, -R, x1 + 1, y1 + 1, z0],
    [x0 - 1, y0 - 1, z1, x1 + 1, y1 + 1, R],
  ];
};

// hide 数组要各帧同一个（换了会重建网格），放模块级：藏掉所有门扇的一份、每扇只留自己的一份
const hiddenWingBoxes: Box[] = Object.values(mainHallDoors).flatMap((m) => m.leaves.map((s) => s.盒));
const keepOnlyMap = new Map<Box, Box[]>(Object.values(mainHallDoors).flatMap((m) => m.leaves.map((s) => [s.盒, keepOnly(s.盒)] as const)));

export type GrassTone = '归隐之地' | '原样';
const pickBin = (color: GrassTone) => (color === '原样' ? houseBin : retreatBin);

/** 一扇门：开 0 关着、1 开到底（原版的开门位置），中间按角度线性转 */
const DoorWingView: React.FC<{ leaf: Leaf; 开: number; 色: GrassTone }> = ({ leaf: { 盒: box, axis, openAngle }, 开: openAmount, 色: color }) => (
  <group position={[axis[0], axis[1], 0]} rotation={[0, 0, (openAngle * openAmount * Math.PI) / 180]}>
    <group position={[-axis[0], -axis[1], 0]}>
      <BlockMesh info={houseInfo} bin={pickBin(color)} atlas={houseAtlas} hide={keepOnlyMap.get(box)} />
    </group>
  </group>
);

/** 把 地洞 底下封上：地板方块的侧面只导出到 z −1，往下压一块暗色平涂当楼梯口（不受光，三渲二平涂也照原色） */
export const MainHallPitBottom: React.FC = () => {
  const [x0, y0, x1, y1] = mainHall.floorHole;
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, -0.99]}>
      <planeGeometry args={[x1 - x0, y1 - y0]} />
      <meshBasicMaterial color="#2a2019" toneMapped={false} />
    </mesh>
  );
};

/** 一楼网格，两扇门换成能开的：开 { 西门?, 北门? } 各 0～1（不给 = 关着）；南头地洞封了底。
 *  放进和 隐世之境一楼 同一个 Z 朝上的 group（坐标同网格本地） */
export const HiddenWorldDoors: React.FC<{ 开: Partial<Record<DoorName, number>>; grassTone?: GrassTone }> = ({ 开: openAmounts, grassTone: color = '归隐之地' }) => (
  <>
    <BlockMesh info={houseInfo} bin={pickBin(color)} atlas={houseAtlas} hide={hiddenWingBoxes} />
    {(Object.keys(mainHallDoors) as DoorName[]).flatMap((doorName) => mainHallDoors[doorName].leaves.map((s, i) => <DoorWingView key={`${doorName}${i}`} leaf={s} 开={openAmounts[doorName] ?? 0} 色={color} />))}
    <MainHallPitBottom />
  </>
);
