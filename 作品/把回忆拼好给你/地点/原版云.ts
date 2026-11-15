// 小木屋头顶那一层原版 fancy 云（第 7 句光柱打散的就是这一层，第 8 句门口头顶接着是它）的参数；算法、画法在 engine/light/云/原版方块.ts、原版方块云.tsx（云组件的 F 算法）。
// 出处：照 末地雷雨 那一路 9f33adf（到 e21e5c6 没再改）的 场/2-雷雨/参数.ts 的云那几个数抄来。纯计算（测试直接引）。
import { cloudCells as engineCloudCells, scatterRadius as engineScatterRadius, type CloudCell, type CloudExtent } from '@engine/light/云/原版方块.ts';
import { legacyFrameSec } from '../分镜/时间.ts';

export { type CloudCell, type CloudExtent } from '@engine/light/云/原版方块.ts';

/** 小木屋头顶那层云（同 场/2-雷雨/参数.ts，数的来由见那边，都是 Agent 暂定）：
 *  底高 = 云底离屋前地面多高（格）；偏 = clouds.png 在世界里平移多少格（挑的是光柱头顶一大团连成片的云）；每刻飘 = 原版每刻往西 0.03 格；
 *  铺 = 铺多大一片（格）；洞心 = 第 7 句光柱打的那一点（她站的地方）；毛边 = 洞口参差多少格；散秒 = 一格云几秒散完（24 fps 时 3 帧） */
export const cabinSkyCloud = {
  bottomHeight: 24,
  offset: [1368, 1476] as const,
  driftPerTick: 0.03,
  extent: { west: -260, east: 260, south: -60, north: 230 } as const,
  holeCenter: [-1.9, -2.1] as const,
  edgeFuzz: 8,
  scatterSec: legacyFrameSec(3),
} as const;

/** 铺得到的云格（默认按 小木屋上空云） */
export const cloudCells = (isOccupied: (u: number, v: number) => boolean, offset: readonly [number, number] = cabinSkyCloud.offset, extent: CloudExtent = cabinSkyCloud.extent): CloudCell[] => engineCloudCells(isOccupied, offset, extent);

/** 这一格云从哪个洞半径起开始散（默认毛边按 小木屋上空云） */
export const scatterRadius = (c: CloudCell, center: readonly [number, number], drift: number, edgeFuzz: number = cabinSkyCloud.edgeFuzz) => engineScatterRadius(c, center, drift, edgeFuzz);
