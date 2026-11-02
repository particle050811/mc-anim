// 主世界区段的纯计算：补水面、花草和缺列后再出网格；工人和同步来源共用同一份规则。
import { blockNames, blockProps, blockTint, voxelFromState } from './真实方块表.ts';
import type { SectionId } from './区段.ts';
import { coarseHeightAt, type 粗高度图 } from './区段包.ts';
import type { VoxelGrid } from './生成.ts';
import { waterFreezes, distantSection, distantBiome, distantTop, type GroundCorrection, type DistantGrid } from './远景.ts';
import { coarseSeaPlant } from './远景海底.ts';
import { coarseGroundPlant } from './远景地面草.ts';

// 场景矩形 [x0, x0 + s) × [y0, y0 + s) 里粗高度图（16 米一格）最高的顶；全没数据是 −Infinity
const coarseAreaTop = (coarseHeights: 粗高度图, x0: number, y0: number, sizeM: number) => {
  const gridM = coarseHeights.格;
  let top = -Infinity;
  for (let y = Math.floor(y0 / gridM) * gridM; y < y0 + sizeM; y += gridM) for (let x = Math.floor(x0 / gridM) * gridM; x < x0 + sizeM; x += gridM) top = Math.max(top, coarseHeightAt(coarseHeights, x + gridM / 2, y + gridM / 2));
  return top;
};

// 粗级里水面那格补成水（结冰的补成冰，同 远景.ts 的 `waterFreezes`）：导入的粗级照 Mipper 合并，水面和海底同格时露出海底，而远景画的是水，两边要一样。
// 认水：这格跨着 y 62（场景 z −2）、是这列最上面一格，粗高度图里这列最高不过水面（−1），离线网格这列也是水（最高实心方块 y ≤ 61：y 62 的沙滩和水面一样平，光看粗高度分不出）
const fillWaterSurface = (voxels: VoxelGrid, coarseHeights: 粗高度图, grid: DistantGrid, origin: number[]) => {
  const cellM = voxels.格;
  if (cellM < 2) return;
  const k = Math.floor((-2 - voxels.原点[2]) / cellM);
  if (k < 0 || k >= voxels.nz) return;
  const colCount = voxels.nx * voxels.ny;
  const waterVoxel = voxelFromState('minecraft:water');
  const iceVoxel = voxelFromState('minecraft:ice');
  const paletteIdByKey = new Map<number, number>();
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    const paletteIdx = voxels.vox[k * colCount + colIdx];
    if (!paletteIdx || voxels.色板[paletteIdx].v === waterVoxel || voxels.色板[paletteIdx].v === iceVoxel) continue;
    let covered = false;
    for (let kk = k + 1; kk < voxels.nz && !covered; kk++) covered = voxels.vox[kk * colCount + colIdx] !== 0;
    if (covered) continue;
    const X0 = voxels.原点[0] + ((colIdx % voxels.nx) - 1) * cellM;
    const Y0 = voxels.原点[1] + (Math.floor(colIdx / voxels.nx) - 1) * cellM;
    if (coarseAreaTop(coarseHeights, X0, Y0, cellM) > -1) continue;
    const gx = X0 + origin[0] + cellM / 2, gz = origin[2] - Y0 - cellM / 2;
    if (distantTop(grid, gx, gz) > 61.5) continue;
    const biome = distantBiome(grid, gx, gz);
    const frozen = waterFreezes(grid, biome, X0 + origin[0] + cellM - 1, origin[2] - Y0 - 1); // 格子东南角那一块（远景.ts 水面结冰 的注释）
    const tint = frozen ? 0xffffff : blockTint(waterVoxel, biome, gx, gz);
    const key = frozen ? -1 : tint;
    let i = paletteIdByKey.get(key);
    if (i === undefined) {
      i = voxels.色板.push({ v: frozen ? iceVoxel : waterVoxel, c: [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255] }) - 1;
      paletteIdByKey.set(key, i);
    }
    voxels.vox[k * colCount + colIdx] = i;
  }
};

// 粗级海底补水草（远景海底.ts 的 `coarseSeaPlant`，同一规则）：导入的粗级照 Mipper 合并，水草和水不透明度一样、按位序挑到水，水草没了，和第 0 级交界上海色会跳。
// 认海底：这列最上面一格是跨着海面的水，往下穿过水碰到的第一格；水草放它上面一格（不放进水面那格）
const fillSeagrass = (voxels: VoxelGrid, grid: DistantGrid, origin: number[]) => {
  const cellM = voxels.格;
  if (cellM < 2 || voxels.水面 === undefined) return;
  const level = Math.round(Math.log2(cellM));
  const colCount = voxels.nx * voxels.ny;
  const waterVoxel = voxelFromState('minecraft:water');
  const paletteIdByKey = new Map<string, number>();
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    let k = voxels.nz - 1;
    while (k >= 0 && !voxels.vox[k * colCount + colIdx]) k--;
    const topK = k;
    if (k < 0 || voxels.色板[voxels.vox[k * colCount + colIdx]].v !== waterVoxel) continue;
    const z0 = voxels.原点[2] + k * cellM;
    if (!(z0 <= voxels.水面 - 1 && voxels.水面 - 1 < z0 + cellM)) continue;
    while (k >= 0 && voxels.vox[k * colCount + colIdx] && voxels.色板[voxels.vox[k * colCount + colIdx]].v === waterVoxel) k--;
    if (k < 0 || !voxels.vox[k * colCount + colIdx] || k + 1 >= topK) continue;
    const X0 = voxels.原点[0] + ((colIdx % voxels.nx) - 1) * cellM;
    const Y0 = voxels.原点[1] + (Math.floor(colIdx / voxels.nx) - 1) * cellM;
    const gx0 = X0 + origin[0], gz0 = origin[2] - Y0 - cellM;
    const plantName = coarseSeaPlant(distantBiome(grid, gx0 + cellM / 2, gz0 + cellM / 2), voxels.水面 - (voxels.原点[2] + (k + 1) * cellM), gx0, gz0, level);
    if (!plantName) continue;
    let i = paletteIdByKey.get(plantName);
    if (i === undefined) {
      i = voxels.色板.push({ v: voxelFromState(plantName), c: [255, 255, 255] }) - 1;
      paletteIdByKey.set(plantName, i);
    }
    voxels.vox[(k + 1) * colCount + colIdx] = i;
  }
};

// 粗级地面补草、花（远景地面草.ts 的 `coarseGroundPlant`，同一规则）：导入的粗级里草和地面挤一格时地面赢，越远草越少，补到第 0 级的比例（本级原有的不重复补）。
// 认地面：这列最上面一格是整格不透明方块（不是树叶、不是积雪的草方块），植物放它上面一格；在这块最上面一格的，整块往上加一格
const fillGroundPlants = (voxels: VoxelGrid, grid: DistantGrid, origin: number[]) => {
  const cellM = voxels.格;
  if (cellM < 2) return;
  const level = Math.round(Math.log2(cellM));
  const colCount = voxels.nx * voxels.ny;
  const { full: FULL, leaf: LEAF } = blockProps;
  const placements: [number, number, number][] = []; // [列, 格, 色板号]
  const paletteIdByKey = new Map<string, number>();
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    let k = voxels.nz - 1;
    while (k >= 0 && !voxels.vox[k * colCount + colIdx]) k--;
    if (k < 0) continue;
    const voxel = voxels.色板[voxels.vox[k * colCount + colIdx]].v;
    if (!FULL[voxel] || LEAF[voxel]) continue;
    const surfaceName = blockNames[voxel - 1];
    if (surfaceName.includes('snowy=true')) continue;
    const X0 = voxels.原点[0] + ((colIdx % voxels.nx) - 1) * cellM;
    const Y0 = voxels.原点[1] + (Math.floor(colIdx / voxels.nx) - 1) * cellM;
    const gx0 = X0 + origin[0], gz0 = origin[2] - Y0 - cellM;
    const biome = distantBiome(grid, gx0 + cellM / 2, gz0 + cellM / 2);
    const plantName = coarseGroundPlant(biome, surfaceName, gx0, gz0, level, true);
    if (!plantName) continue;
    const pv = voxelFromState(plantName);
    const tint = blockTint(pv, biome, gx0, gz0);
    const key = `${plantName}|${tint}`;
    let i = paletteIdByKey.get(key);
    if (i === undefined) {
      i = voxels.色板.push({ v: pv, c: [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255] }) - 1;
      paletteIdByKey.set(key, i);
    }
    placements.push([colIdx, k + 1, i]);
  }
  if (!placements.length) return;
  if (placements.some(([, k]) => k >= voxels.nz)) {
    const vox = new Uint16Array(colCount * (voxels.nz + 1));
    vox.set(voxels.vox);
    voxels.vox = vox;
    voxels.nz++;
  }
  for (const [colIdx, k, i] of placements) voxels.vox[k * colCount + colIdx] = i;
};

// 两块同一个区段的体素块按列并起来：`取[c]` 为真的列用 B，其余用 A。竖直范围取并集，原范围以下当实心（体素块的约定），并后多出的格子填石头（地下本来是石头）
const mergeColumns = (gridA: VoxelGrid, gridB: VoxelGrid, pickB: Uint8Array): VoxelGrid => {
  const cellM = gridA.格;
  const colCount = gridA.nx * gridA.ny;
  const k0 = Math.min(gridA.原点[2], gridB.原点[2]) / cellM;
  const k1 = Math.max(gridA.原点[2] + gridA.nz * cellM, gridB.原点[2] + gridB.nz * cellM) / cellM;
  const nz = k1 - k0;
  const palette = [...gridA.色板];
  const paletteOffset = palette.length - 1;
  for (let paletteIdx = 1; paletteIdx < gridB.色板.length; paletteIdx++) palette.push(gridB.色板[paletteIdx]);
  const stonePaletteId = palette.push({ v: voxelFromState('minecraft:stone'), c: [255, 255, 255] }) - 1;
  const vox = new Uint16Array(colCount * nz);
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    const useB = pickB[colIdx] === 1;
    const srcGrid = useB ? gridB : gridA;
    const kb = srcGrid.原点[2] / cellM - k0; // S 的第 0 格在新块里的格号
    let filled = false;
    for (let k = 0; k < srcGrid.nz; k++) {
      const paletteIdx = srcGrid.vox[k * colCount + colIdx];
      if (!paletteIdx) continue;
      vox[(k + kb) * colCount + colIdx] = useB ? paletteIdx + paletteOffset : paletteIdx;
      filled = true;
    }
    if (filled) for (let k = 0; k < kb; k++) vox[k * colCount + colIdx] = stonePaletteId;
  }
  return { nx: gridA.nx, ny: gridA.ny, nz, 格: cellM, 原点: [gridA.原点[0], gridA.原点[1], k0 * cellM], vox, 色板: palette, 水面: gridA.水面 };
};

// 交界修正是场景坐标的分米网格，跨线程传数据，在各线程重建同一插值函数。
export type Seam = { x0: number; y0: number; cellSize: number; nx: number; ny: number; deltas: Int16Array; basis?: { 粗高度指纹: string; 远景层: string[] } };
export const seamCorrection = (J: Seam, origin: number[]): GroundCorrection => (gx, gz) => {
  const gridU = (gx - origin[0] - J.x0) / J.cellSize - 0.5;
  const gridV = (origin[2] - gz - J.y0) / J.cellSize - 0.5;
  const i = Math.floor(gridU), j = Math.floor(gridV);
  if (i < -1 || j < -1 || i >= J.nx || j >= J.ny) return 0;
  const at = (a: number, b: number) => (a < 0 || b < 0 || a >= J.nx || b >= J.ny ? 0 : J.deltas[b * J.nx + a] / 10);
  const fu = gridU - i, fv = gridV - j;
  const d00 = at(i, j), d10 = at(i + 1, j), d01 = at(i, j + 1), d11 = at(i + 1, j + 1);
  return d00 + (d10 - d00) * fu + (d01 - d00) * fv + (d00 - d10 - d01 + d11) * fu * fv;
};

export type OverworldContext = { grid: DistantGrid; origin: [number, number, number]; coarseHeights: 粗高度图; seam: Seam | null };

export const completeOverworldSection = (voxels: VoxelGrid | null, section: SectionId, context: OverworldContext): VoxelGrid => {
  const { grid, origin, coarseHeights, seam } = context;
  const oy = origin[1];
  const correction = seam ? seamCorrection(seam, origin) : undefined;
  if (!voxels) return distantSection(grid, origin, section, undefined, correction);
  voxels.水面 = grid.海平面 - oy; // 各级的海面画齐（lib/体素/网格.ts 的 液顶）
  fillWaterSurface(voxels, coarseHeights, grid, origin);
  fillSeagrass(voxels, grid, origin);
  fillGroundPlants(voxels, grid, origin);
  // 没数据的列：整列空气（烘焙时区段的 `k底` 取所有列最低地表，有数据的列在其上一定有方块）；挖地标整列挖空的列（`V.挖空`）也是整列空气但有数据，不补
  const colCount = voxels.nx * voxels.ny;
  const emptyCols = new Uint8Array(colCount).fill(1);
  let anyEmpty = false;
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    if (voxels.挖空?.[colIdx]) {
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
  if (!anyEmpty) return voxels;
  return mergeColumns(voxels, distantSection(grid, origin, section, (c) => emptyCols[c] === 1, correction), emptyCols);
};
