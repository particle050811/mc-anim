// 隐世之境一楼主厅通屋外的两扇门（结构 hidden_retreat_1 的模板坐标）：
// - 西门：模板 (6, 1..2, 10) 的深色橡木单开门（facing east、hinge left），门外是西边的石子路，进门正对着东墙那扇窗；第 15 句你从这里推门进来。
// - 北门：模板 (11..12, 1..2, 6) 的金合欢木双开门（facing north，左扇 hinge left、右扇 hinge right），门外是北院（锻台、灶台）；章 1 一楼机位里在她身后。
// 网格里门都是关着的。这里把关着的门扇从一楼网格里藏掉，再用同一份网格只留门扇的面、绕门轴转开：贴图、AO 都是游戏导出的原样。
// 转开的终点照 1.20.1 DoorBlock.getShape（开着时门扇贴在门洞那格的一边、占满进深），关和开两个位置之间按刚体转 90°，转轴在门扇厚度中线上（由两个位置推出来）。
// 坐标同 地点/隐世之境一楼.tsx（网格本地，Z 朝上：x 东、y 北、z 上）。
// 草色：默认用换成归隐之地草色的那份顶点（网格/隐世之境一楼/顶点-归隐之地，只换了群系染的颜色），'原样' 是片场存档主世界的草色。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { BlockMesh, type BlockMeshInfo } from '@engine/voxel/方块网格.tsx';
import houseRaw from 'asset:网格/隐世之境一楼/头';
import houseBin from 'asset:网格/隐世之境一楼/顶点';
import retreatBin from 'asset:网格/隐世之境一楼/顶点-归隐之地';
import houseAtlas from 'asset:网格/隐世之境一楼/图集';

const houseInfo = houseRaw as unknown as BlockMeshInfo;
type 盒 = [number, number, number, number, number, number];
type 平点 = [number, number];

/** 一扇门扇：面心范围（按面心严格在盒里算这扇门的面）、转轴（网格本地 x, y）、开到底时绕 +Z 转的角（度） */
type 扇 = { 盒: 盒; 轴: 平点; 开角: number };
/** 门洞：光照进来的那个竖直长方形，底边从 a 到 b（网格本地 x, y）、高从 底 到 顶。开着的门扇占掉的那一条不算 */
export type 门洞 = { a: 平点; b: 平点; 底: number; 顶: number };
export type 门 = { 扇们: readonly 扇[]; 洞: 门洞; /** 门洞那一格正中（地板顶面） */ 中: V3 };

// 盒的 z 上界停在 1.99：门顶面和门楣（活板门）底面同在 z 2，门顶面朝上、从门洞里抬头也看不见，留在一楼网格里；门楣底面朝下，也留。
// 北门两扇相接的 x 12 竖面两扇各拿一份，背面朝外的那份被剔除，不显
export const 主厅门们: { 西门: 门; 北门: 门 } = {
  西门: {
    // 关着：x 6～6.1875、y −11～−10；开着：x 6～7、y −10.1875～−10（贴门洞北沿，往屋里甩）
    扇们: [{ 盒: [5.99, -11.01, -0.01, 6.2, -9.99, 1.99], 轴: [6.09375, -10.09375], 开角: 90 }],
    洞: { a: [7, -10.1875], b: [7, -11], 底: 0, 顶: 2 },
    中: [6.5, -10.5, 0],
  },
  北门: {
    // 关着：y −7～−6.8125；开着：左扇贴西沿 x 11～11.1875、右扇贴东沿 x 12.8125～13（往院子里甩）
    扇们: [
      { 盒: [10.99, -7.01, -0.01, 12.01, -6.8, 1.99], 轴: [11.09375, -6.90625], 开角: 90 },
      { 盒: [11.99, -7.01, -0.01, 13.01, -6.8, 1.99], 轴: [12.90625, -6.90625], 开角: -90 },
    ],
    洞: { a: [11.1875, -7], b: [12.8125, -7], 底: 0, 顶: 2 },
    中: [12, -6.5, 0],
  },
};
export type 门名 = keyof typeof 主厅门们;

export const 主厅 = {
  /** 主厅地上那块地毯（模板 x 10～14、z 9～14 的地毯，顶面高 1/16）：门光的亮块落到这里要抬到地毯顶面 */
  地毯: { 框: [10, -15, 15, -9] as [number, number, number, number], 高: 1 / 16 },
  /** 主厅南头地板上的洞（模板 x 12～15、z 16，结构里就是空气，底下本来接另一块拼图结构）：网格下面是空的，从屋里看过去会透出天色 */
  地洞: [12, -17, 16, -16] as [number, number, number, number],
  /** 东墙那扇窗（玻璃板在 x 17.5 那个面上）：y −14～−11、z 1～4 */
  东窗: { x: 17.5, y0: -14, y1: -11, 底: 1, 顶: 4 },
};

// 盒 B 以外的全部空间（6 块，互相有重叠没关系）：用 hide 藏掉它们就只剩 B 里的面
const 只留 = ([x0, y0, z0, x1, y1, z1]: 盒): 盒[] => {
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
const 藏门扇: 盒[] = Object.values(主厅门们).flatMap((m) => m.扇们.map((s) => s.盒));
const 只留表 = new Map<盒, 盒[]>(Object.values(主厅门们).flatMap((m) => m.扇们.map((s) => [s.盒, 只留(s.盒)] as const)));

export type 草色 = '归隐之地' | '原样';
const 顶点 = (色: 草色) => (色 === '原样' ? houseBin : retreatBin);

/** 一扇门：开 0 关着、1 开到底（原版的开门位置），中间按角度线性转 */
const 门扇: React.FC<{ 扇: 扇; 开: number; 色: 草色 }> = ({ 扇: { 盒, 轴, 开角 }, 开, 色 }) => (
  <group position={[轴[0], 轴[1], 0]} rotation={[0, 0, (开角 * 开 * Math.PI) / 180]}>
    <group position={[-轴[0], -轴[1], 0]}>
      <BlockMesh info={houseInfo} bin={顶点(色)} atlas={houseAtlas} hide={只留表.get(盒)} />
    </group>
  </group>
);

/** 把 地洞 底下封上：地板方块的侧面只导出到 z −1，往下压一块暗色平涂当楼梯口（不受光，三渲二平涂也照原色） */
export const 主厅地洞底: React.FC = () => {
  const [x0, y0, x1, y1] = 主厅.地洞;
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, -0.99]}>
      <planeGeometry args={[x1 - x0, y1 - y0]} />
      <meshBasicMaterial color="#2a2019" toneMapped={false} />
    </mesh>
  );
};

/** 一楼网格，两扇门换成能开的：开 { 西门?, 北门? } 各 0～1（不给 = 关着）；南头地洞封了底。
 *  放进和 隐世之境一楼 同一个 Z 朝上的 group（坐标同网格本地） */
export const 隐世之境一楼开门: React.FC<{ 开: Partial<Record<门名, number>>; 草色?: 草色 }> = ({ 开, 草色: 色 = '归隐之地' }) => (
  <>
    <BlockMesh info={houseInfo} bin={顶点(色)} atlas={houseAtlas} hide={藏门扇} />
    {(Object.keys(主厅门们) as 门名[]).flatMap((名) => 主厅门们[名].扇们.map((s, i) => <门扇 key={`${名}${i}`} 扇={s} 开={开[名] ?? 0} 色={色} />))}
    <主厅地洞底 />
  </>
);
