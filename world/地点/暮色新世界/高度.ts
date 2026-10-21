// 按地形查高度：粗高度图上的地物顶、镜头地面、巡航高度、视野到导入范围边的距离、求解缓存的地形键。
import { coarseHeightAt, coarseHeightFingerprint } from '../../../engine/voxel/区段包.ts';
import { frozenCoarse } from '../../../engine/voxel/冻结粗高度.ts';
import { hash64 } from '../../../engine/core/求解缓存.ts';
import { twilightPackName } from './地标表.ts';
import { frameByName, landmarkRanges } from './摆放.ts';

// ---------- 高度 ----------
// 粗高度图（16 米一格，每格里最高那块方块的顶，含树冠、水面、新世界的结构），烘焙时写进 包.json，编排用冻结进仓库的那份（lib/体素/冻结粗高度.ts）
const coarse = frozenCoarse(twilightPackName);
// 一格的地物顶（世界 z）：地标范围里用地标的地面（那里粗高度图是新世界自己的结构，画的是旧网格）；补挖的巨树框里按 min(粗高度, 剩顶)。
// 宽容（米）：格心离框不到这么远也算在框里（一镜到底/路线.ts 量离树用半格：补挖框只框那棵树，树冠压着的格格心常在框外几米，不算的话粗高度还当那棵树在）
export const twilightCellTop = (x: number, y: number, toleranceM = 0) => {
  const sampled = coarseHeightAt(coarse, x, y);
  const coarseTop = sampled === -Infinity ? 0 : sampled;
  let top = -Infinity;
  for (const range of landmarkRanges)
    if (x >= range.box[0] - toleranceM && x < range.box[2] + toleranceM && y >= range.box[1] - toleranceM && y < range.box[3] + toleranceM) top = Math.max(top, range.remainTop === null ? frameByName[range.name].地面 : Math.min(coarseTop, range.remainTop));
  return top === -Infinity ? coarseTop : top;
};
const featureTopCell = (x: number, y: number) => twilightCellTop(x, y);
// 在地标本身的挖框里（换成了旧网格的那块；补挖的巨树框不算，那里地上的林冠还在）
export const isInTwilightLandmark = (x: number, y: number) => landmarkRanges.some((r) => r.remainTop === null && x >= r.box[0] && x < r.box[2] && y >= r.box[1] && y < r.box[3]);
// 地物顶（世界 z）：(x, y) 所在那格和四周 8 格里最高的（镜头不钻树、编排排高度都按它，宁高勿低）
export const twilightFeatureTop = (x: number, y: number) => {
  let top = featureTopCell(x, y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) top = Math.max(top, featureTopCell(x + dx * coarse.格, y + dy * coarse.格));
  return top;
};
// 镜头不钻地用的地面（世界 z）：镜头在地标范围里不按地形压（-∞）：洞道、墙洞、屋里由各段编排的路线和孔道管；在外面按 `暮色地物顶`（3×3 取最高，宁高勿低）。
// 地标里不按 3×3：雪怪洞窟核心只有土丘一块，镜头在孔道里靠近核心边时邻格一会儿在外（树顶）一会儿全在里（地标地面），镜头一帧上下跳 15 米、钻进云杉
export const twilightCameraGround = (x: number, y: number) => (isInTwilightLandmark(x, y) ? -Infinity : twilightFeatureTop(x, y));
// 巡航高度（用户 10-07：离脚下树冠 60 米上下）：树冠取方圆 `半径` 米里各格（粗高度图一格 16 米、取格里最高的）的中位，即林海的树冠面；
// 零星的巨树（能到 y 80～95）不把整片巡航高度顶上去，离巨树多近由 一镜到底/诊断 查
export const cruiseClearanceM = 60;
export const canopySurface = (x: number, y: number, radiusM = 250) => {
  const tops: number[] = [];
  for (let dy = -radiusM; dy <= radiusM; dy += coarse.格) for (let dx = -radiusM; dx <= radiusM; dx += coarse.格) if (dx * dx + dy * dy <= radiusM * radiusM) tops.push(featureTopCell(x + dx, y + dy));
  tops.sort((a, b) => a - b);
  return tops[Math.floor(tops.length / 2)];
};
export const cruiseHeight = (x: number, y: number) => canopySurface(x, y) + cruiseClearanceM;
// 求解缓存（lib/求解缓存.ts）的地形层：地形没变，按地形算出来的东西（一镜到底每程的巡航层）就能复用。按值算：粗高度图每格、地标挖框和地面，加上按地形取高度的几个函数的源码（取法改了也要重算）。只算一次
let terrainKey: unknown[] | null = null;
export const twilightTerrainKey = () =>
  (terrainKey ??= [
    coarseHeightFingerprint(coarse),
    landmarkRanges.map((r) => [r.name, r.box, r.remainTop, frameByName[r.name].地面]),
    [twilightCellTop, featureTopCell, isInTwilightLandmark, canopySurface, coarseHeightAt].map((f) => hash64(f.toString())),
  ]);
// 视野里离导入范围的边多远（米）：从镜头沿水平视线左右 ±55° 打 11 条线，每 24 米查一次粗高度图，碰到没有数据的格就停，取最近的。
// 画面把雾的远端压到这个距离以内，边就融进雾里，不会露出齐刷刷的地平线（用户 10-05）
export const viewEdgeDistance = (camPos: number[], lookAt: number[], maxDistM = 4000) => {
  const yaw = Math.atan2(lookAt[1] - camPos[1], lookAt[0] - camPos[0]);
  let dist = maxDistM;
  for (let k = -5; k <= 5; k++) {
    const angle = yaw + (k * 11 * Math.PI) / 180;
    const cx = Math.cos(angle), cy = Math.sin(angle);
    for (let rayDist = 24; rayDist < dist; rayDist += 24) {
      if (coarseHeightAt(coarse, camPos[0] + cx * rayDist, camPos[1] + cy * rayDist) === -Infinity) {
        dist = rayDist;
        break;
      }
    }
  }
  return dist;
};
// 镜头离地多高（给雾和投影的级联切分：暮色光照 的 离地）
export const twilightHeightAboveGround = (p: number[]) => p[2] - twilightFeatureTop(p[0], p[1]);
