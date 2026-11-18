import { voxelFromState } from './真实方块表.ts';
import type { VoxelGrid } from './生成.ts';

// 两块同一个区段的体素块按列并起来：`取[c]` 为真的列用 B，其余用 A。竖直范围取并集，原范围以下当实心（体素块的约定），并后多出的格子填石头（地下本来是石头）
export const mergeColumns = (gridA: VoxelGrid, gridB: VoxelGrid, pickB: Uint8Array): VoxelGrid => {
  const cellM = gridA.cell;
  const colCount = gridA.nx * gridA.ny;
  const k0 = Math.min(gridA.origin[2], gridB.origin[2]) / cellM;
  const k1 = Math.max(gridA.origin[2] + gridA.nz * cellM, gridB.origin[2] + gridB.nz * cellM) / cellM;
  const nz = k1 - k0;
  const palette = [...gridA.palette];
  const paletteOffset = palette.length - 1;
  for (let paletteIdx = 1; paletteIdx < gridB.palette.length; paletteIdx++) palette.push(gridB.palette[paletteIdx]);
  const stonePaletteId = palette.push({ v: voxelFromState('minecraft:stone'), c: [255, 255, 255] }) - 1;
  const vox = new Uint16Array(colCount * nz);
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    const useB = pickB[colIdx] === 1;
    const srcGrid = useB ? gridB : gridA;
    const kb = srcGrid.origin[2] / cellM - k0; // S 的第 0 格在新块里的格号
    let filled = false;
    for (let k = 0; k < srcGrid.nz; k++) {
      const paletteIdx = srcGrid.vox[k * colCount + colIdx];
      if (!paletteIdx) continue;
      vox[(k + kb) * colCount + colIdx] = useB ? paletteIdx + paletteOffset : paletteIdx;
      filled = true;
    }
    if (filled) for (let k = 0; k < kb; k++) vox[k * colCount + colIdx] = stonePaletteId;
  }
  return { nx: gridA.nx, ny: gridA.ny, nz, cell: cellM, origin: [gridA.origin[0], gridA.origin[1], k0 * cellM], vox, palette: palette, waterLevel: gridA.waterLevel };
};

export const emptyColumns = (voxels: VoxelGrid) => {
  // 没数据的列：整列空气（烘焙时区段的 `k底` 取所有列最低地表，有数据的列在其上一定有方块）；挖地标整列挖空的列（`V.挖空`）也是整列空气但有数据，不补
  const colCount = voxels.nx * voxels.ny;
  const emptyCols = new Uint8Array(colCount).fill(1);
  let anyEmpty = false;
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    if (voxels.carveMask?.[colIdx]) {
      emptyCols[colIdx] = 0;
      continue;
    }
    for (let k = 0; k < voxels.nz; k++)
      if (voxels.vox[k * colCount + colIdx]) {
        emptyCols[colIdx] = 0;
        break;
      }
    if (emptyCols[colIdx]) anyEmpty = true;
  }
  return anyEmpty ? emptyCols : null;
};
