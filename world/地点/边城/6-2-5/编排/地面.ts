// 航线下面的地物顶面：导入包的粗高度图，范围外退回 航线地面.json。
import { coarseHeightAt } from '../../../../../engine/voxel/区段包.ts';
import { frozenCoarse } from '../../../../../engine/voxel/冻结粗高度.ts';
import { overworldPackName } from '../../../主世界116.ts';
import groundJson资产 from 'asset:数据/镜头/6-2-5/航线地面';
const groundJson = groundJson资产 as unknown as { x0: number; y0: number; 格: number; nx: number; ny: number; 高: string };

// ---------- 地面 ----------
// 巡航高度的口径照暮色（用户 10-05：主世界巡航高度太高、下面看不清，改成和暮色差不多）：离方圆 250 米内地物顶面的中位 80 米（同 模型/场景/暮色新世界.tsx 的 `canopySurface` + `cruiseClearanceM`），
//   林子上是树冠、平原上是地面、雪山上是雪面；离近处最高的东西（所在那格和四周 8 格里最高的顶）至少 25 米（同 一镜到底/路线.ts 的 `treeClearance`）。
// 地物顶面：导入范围里查导入包 主世界-116 的粗高度图（16 米一格里最高的方块顶，含树冠、水面，同 `twilightFeatureTop` 的来源），用冻结进仓库的那份（lib/体素/冻结粗高度.ts），重烘导入包航线不跟着变；
// 导入范围外退回 航线地面.json（工具/导入/航线地面.ts 算的 64 米一格的最高顶，远景那边不含树）。航线全在导入走廊里，退回的只有走廊边上几格
const coarse = frozenCoarse(overworldPackName);
const groundGrid = (() => {
  const bytes = Uint8Array.from(atob(groundJson.高), (c) => c.charCodeAt(0));
  return { ...groundJson, 高: new Int16Array(bytes.buffer, 0, groundJson.nx * groundJson.ny) };
})();
export const routeGround = (x: number, y: number) => {
  const { x0, y0, 格: cellM, nx, ny, 高: heights } = groundGrid;
  const i = Math.floor((x - x0) / cellM);
  const j = Math.floor((y - y0) / cellM);
  if (i < 0 || j < 0 || i >= nx || j >= ny) return -1; // 海面（y 63 的顶，场景 z −1）
  return heights[j * nx + i];
};
const cellTop = (x: number, y: number) => {
  const top = coarseHeightAt(coarse, x, y);
  return top === -Infinity ? routeGround(x, y) : top;
};
// 近处最高的顶：所在那格和四周 8 格（同 暮色地物顶）
export const featureTop = (x: number, y: number) => {
  let top = -Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) top = Math.max(top, cellTop(x + dx * coarse.格, y + dy * coarse.格));
  return top;
};
// 地物顶面：方圆 半径 米里各格的中位（同 树冠面）
export const featureSurface = (x: number, y: number, radius = 250) => {
  const samples: number[] = [];
  for (let dy = -radius; dy <= radius; dy += coarse.格) for (let dx = -radius; dx <= radius; dx += coarse.格) if (dx * dx + dy * dy <= radius * radius) samples.push(cellTop(x + dx, y + dy));
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
};
