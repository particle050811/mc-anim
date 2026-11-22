// 导入包为主、远景兜底的地形（engine/voxel/主世界地形.ts 的 buildOverworld）上一处的地物顶和竖直范围。纯模块：Node 里算加载计划也要同一份。
import { coarseHeightAt, type CoarseHeightMap } from './区段包.ts';
import { distantTop, type DistantGrid } from './远景网格.ts';
import { seamCorrection, type Seam } from './交界修正.ts';
import type { TerrainSampler } from './地表.ts';

/**
 * 场景 (x, y) 处的地物顶（场景 z）：导入范围里是粗高度图（含树冠、水面），外面是远景的地面或水面（加上交界修正，不算树）。
 * 选区段拿它估距离，地形跟随拿它当地面，树冠差几米不要紧
 */
export const fallbackSampler = (coarse: CoarseHeightMap, grid: DistantGrid, seam: Seam | null, origin: readonly number[]) => {
  const [ox, oy, oz] = origin;
  const correction = seam ? seamCorrection(seam, origin) : undefined;
  const distantGround = (x: number, y: number) => {
    const groundY = distantTop(grid, x + ox, oz - y) + (correction ? correction(x + ox, oz - y) : 0);
    return Math.max(Math.round(groundY) + 1 - oy, grid.seaLevel - oy);
  };
  return (x: number, y: number) => {
    const coarseTop = coarseHeightAt(coarse, x, y);
    return coarseTop === -Infinity ? distantGround(x, y) : coarseTop;
  };
};

/** 竖直范围（场景 z）：导入的（维度下界 ～ 最高的方块顶）、补充包的顶，和远景网格最高处 + 最高的树 */
export const fallbackHeightRange = (importedRange: readonly [number, number], grid: DistantGrid, origin: readonly number[], treeHeight: number, supplementTop = -Infinity): [number, number] => {
  let maxHeight = -Infinity;
  for (const height of grid.height) if (height > maxHeight) maxHeight = height;
  return [importedRange[0], Math.max(importedRange[1], supplementTop, maxHeight + 1 - origin[1] + treeHeight)];
};

/** 主世界那种「导入包为主、远景兜底」的地形挑区段用的那几样（buildOverworld 和加载计划共用）：地物顶采样、竖直范围（树按 26 米算） */
export const fallbackSelection = (coarse: CoarseHeightMap, coarsestLevel: number, importedRange: readonly [number, number], grid: DistantGrid, seam: Seam | null, origin: readonly number[]) => {
  const groundAt = fallbackSampler(coarse, grid, seam, origin);
  return {
    groundAt,
    // 不带 canSplit：主世界按整包的最细级挑
    source: {
      coarsestLevel,
      采样: ((x, y, out) => {
        out.z = groundAt(x, y);
        out.crown = 0;
      }) satisfies TerrainSampler,
    },
    heightRange: fallbackHeightRange(importedRange, grid, origin, 26),
  };
};
