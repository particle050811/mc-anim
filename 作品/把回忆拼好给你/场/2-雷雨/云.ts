// 第 6、7 句的云：原版 fancy 云（用户 10-24「这个云也太敷衍了」：要原版那种立体方块云，雨天整层压暗，光柱打上去一圈一圈散开、洞越开越大）。
// 算法、画法在 engine/light/云/原版方块.ts、原版方块云.tsx（云组件的 F 算法），这里只按本场的 参数.ts 给默认值。纯计算（测试直接引）。
import { cloudCells as engineCloudCells, scatterRadius as engineScatterRadius, type CloudCell } from '@engine/light/云/原版方块.ts';
import * as params from './参数.ts';

export { cloudCell, type CloudCell } from '@engine/light/云/原版方块.ts';

/** 铺得到的云格（偏 = 贴图在世界里平移几格，默认 参.云偏；铺默认 参.云铺） */
export const cloudCells = (isOccupied: (u: number, v: number) => boolean, offset: readonly [number, number] = params.cloudOffset, extent = params.cloudExtent): CloudCell[] => engineCloudCells(isOccupied, offset, extent);

/** 这一格云从哪个洞半径起开始散（毛边 = 参.云洞.毛边） */
export const scatterRadius = (c: CloudCell, center: readonly [number, number], drift: number) => engineScatterRadius(c, center, drift, params.cloudHole.edgeFuzz);
