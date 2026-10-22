// 地形粗高度图上的「有效顶」和镜头离地：只给诊断量离树、镜头离地用，航线不让树。
import { frozenCoarse } from '@engine/voxel/冻结粗高度.ts';
import { isInTwilightLandmark, twilightCellTop, twilightFrozen } from '../../../../地点/暮色新世界.tsx';

const coarse = frozenCoarse(twilightFrozen);
const cellTop = (x: number, y: number) => twilightCellTop(x, y, coarse.格 / 2);
const treeClearance = 25;
const clearanceTop = (x: number, y: number, clearance: number, drop: number) => {
  const cellSize = coarse.格;
  const i0 = Math.floor((x - coarse.x0) / cellSize);
  const j0 = Math.floor((y - coarse.y0) / cellSize);
  const k = Math.ceil(clearance / cellSize);
  let maxTop = -Infinity;
  for (let dj = -k; dj <= k; dj++)
    for (let di = -k; di <= k; di++) {
      const ax = coarse.x0 + (i0 + di) * cellSize;
      const ay = coarse.y0 + (j0 + dj) * cellSize;
      const dx = Math.max(ax - x, 0, x - (ax + cellSize));
      const dy = Math.max(ay - y, 0, y - (ay + cellSize));
      const d2 = dx * dx + dy * dy;
      if (d2 >= clearance * clearance) continue;
      maxTop = Math.max(maxTop, cellTop(ax + cellSize / 2, ay + cellSize / 2) + Math.sqrt(clearance * clearance - d2) - drop);
    }
  return maxTop;
};
// 有效顶：把附近的格按水平距离折算以后「等效的地物顶」，扫帚比它高 25 米，离附近的地物三维就不近于 25 米（偏保守；诊断用）
export const 有效顶 = (x: number, y: number) => clearanceTop(x, y, treeClearance, treeClearance);
// 镜头离地（诊断报警告用；镜头.ts 不自动顶高，用户 10-08 要求报 warning 而不是擅自改路线）：地标里是 −∞
export const 镜头地面 = (x: number, y: number) => (isInTwilightLandmark(x, y) ? -Infinity : clearanceTop(x, y, 3, 3));
