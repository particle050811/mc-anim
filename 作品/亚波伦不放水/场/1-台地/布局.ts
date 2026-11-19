// 正片场地（真下界的台地，地点/真下界位置.ts 的 真下界场地）上各样东西摆在哪。纯数据、纯计算，段.ts 也能引。
// 游戏坐标（x 东、y 上、z 南）写位置，用 台地点 换成场景坐标（Z 朝上：x 东、y 北、z 上）；高度照 脚高表.ts 逐列取，地不整平。
// 这些位置都是 Agent 取的，用户没看过。
import type { V3 } from '@engine/model/parts.tsx';
import { realNetherScene } from '../../地点/真下界位置.ts';
import { footRegion, footHeightRows } from './脚高表.ts';

const heightTable = footHeightRows.map((line) => line.split(' ').map(Number));

/** 游戏 (x, z) 那一列脚的高度（游戏 y）；出了表的范围报错（没查过的列不猜） */
export const footHeight = (x: number, z: number): number => {
  const [i, j] = [Math.floor(x) - footRegion.x[0], Math.floor(z) - footRegion.z[0]];
  const y = heightTable[j]?.[i];
  if (y === undefined) throw new Error(`台地脚高表没有 (${x}, ${z}) 这一列（范围 x ${footRegion.x}，z ${footRegion.z}）`);
  return y;
};

/** 游戏 (x, z) 站在地上的点 → 场景坐标；抬 = 离地几格 */
export const terracePoint = (x: number, z: number, lift = 0): V3 => realNetherScene(x, footHeight(x, z) + lift, z);

/** 祭坛那一列的中心（安息仪式结构的原点：黑曜石底的顶）。7×7 黑曜石底换掉 x 895～901、z −303～−297 的地面那一层，这 49 列脚高都是 50 */
export const altar = terracePoint(898.5, -299.5);
/** 结界罩住他的地方（第 3 幕起他被钉在这里）：祭坛东南，四周 10 格内脚高 49～51 */
export const steveTrappedPos = terracePoint(906.5, -293.5);

/** 开盘、齐放共用的高位：相对祭坛向西北退、同时拔高，保留真实右手指向受困位的俯角。 */
export const openingPerch = [-15, 11.50, 36.0] as const;
