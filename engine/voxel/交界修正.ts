// 交界修正（工具/导入/交界.ts 写）：导入的列和远景的列交界处的高差，远景在交界外 256 米里渐变补上（来由见 engine/voxel/主世界地形.ts 文件头）。
// 16 米一格的 Int16（分米），场景坐标（导入包原点）；双线性取，格外是 0。依据：导入包粗高度图的指纹、远景各加密层块数。纯模块，Node 也读。
import type { DataSource } from '../core/数据读取.ts';
import { coarseHeightFingerprint, type CoarseHeightMap } from './区段包.ts';
import type { DistantGrid } from './远景网格.ts';
import type { GroundCorrection } from './远景.ts';

export type Seam = { x0: number; y0: number; cellSize: number; nx: number; ny: number; deltas: Int16Array; basis?: { coarseHeightFingerprint: string; farLayers: string[] } };
// distantDir：远景包的版本目录（packDir）；没有修正给 null 并在控制台提示
export const readSeam = (src: DataSource, distantDir: string, packName: string) =>
  src.once(`${distantDir}/交界.${packName}`, async (): Promise<Seam | null> => {
    const meta = await src.jsonIfAny<{ x0: number; y0: number; cell: number; nx: number; ny: number; basis?: Seam['basis'] }>(`${distantDir}/交界.${packName}.json`);
    if (!meta) {
      console.warn(`主世界地形：${distantDir} 里没有 交界.${packName}.json，交界不修（跑 工具/导入/交界.ts）`);
      return null;
    }
    const deltas = new Int16Array(await src.gunzip(`${distantDir}/交界.${packName}.bin.gz`));
    return { x0: meta.x0, y0: meta.y0, cellSize: meta.cell, nx: meta.nx, ny: meta.ny, deltas: deltas, basis: meta.basis };
  });

// 修正是不是对着手上这版导入包、远景包算的：导入范围或加密层变了，旧修正修不到新交界
export const seamBasisMatches = (seam: Seam, coarse: CoarseHeightMap, grid: DistantGrid) => {
  const fingerprint = coarseHeightFingerprint(coarse), layerSig = grid.layers.map((F) => `${F.name}:${F.tile.size}`).join(',');
  return seam.basis?.coarseHeightFingerprint === fingerprint && seam.basis?.farLayers.join(',') === layerSig;
};

export const seamCorrection = (J: Seam, origin: readonly number[]): GroundCorrection => (gx, gz) => {
  const gridU = (gx - origin[0] - J.x0) / J.cellSize - 0.5;
  const gridV = (origin[2] - gz - J.y0) / J.cellSize - 0.5;
  const i = Math.floor(gridU), j = Math.floor(gridV);
  if (i < -1 || j < -1 || i >= J.nx || j >= J.ny) return 0;
  const at = (a: number, b: number) => (a < 0 || b < 0 || a >= J.nx || b >= J.ny ? 0 : J.deltas[b * J.nx + a] / 10);
  const fu = gridU - i, fv = gridV - j;
  const d00 = at(i, j), d10 = at(i + 1, j), d01 = at(i, j + 1), d11 = at(i + 1, j + 1);
  return d00 + (d10 - d00) * fu + (d01 - d00) * fv + (d00 - d10 - d01 + d11) * fu * fv;
};
