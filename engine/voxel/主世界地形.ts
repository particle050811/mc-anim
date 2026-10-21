// 主世界地形：主世界镜头（6-2-4、6-2-5、6-2-6、6-3）统一的体素来源——游戏里预生成后导入的区段包（lib/体素/导入地形.ts）为主，导入范围外用离线高度图（lib/体素/远景.ts）兜底。用法：
//   const 地形 = use主世界地形();            // 默认 主世界-116 + 主世界-116-远景；取到之前是 null（已 delayRender 拦着截图）
//   <体素世界 键={地形.键} 来源={地形.来源} 中心={镜头} 像素={…} 远={地形.远} 高度={地形.高度} />
//   地形.位置([x, y, z])    // 游戏坐标 → 场景坐标
//   地形.地面(x, y)         // 场景坐标处的地物顶，给 lib/地形跟随.ts：导入范围里是粗高度图（16 米一格最高方块顶，含树冠、水面），外面是远景地面或水面（不含树）
//   基地屋里看窗外的镜头：雾和最远距离换成 `overworldWindowView`（理由见下），别的主世界镜头照 6-2-5 的雾、远 = 地形.远
// 一个区段怎么拼：整块在导入范围外的按远景生成；包里有的，导入的列原样用，没数据的列（区块没生成）按远景补（`distantSection` 只生成这些列），两份按格高并成一块；
//   粗级里水面那格被海底盖住的（Mipper，见 远景.ts 文件头）补成水（补水面），合并时丢掉的水草、地面草花照第 0 级比例补回（补海草、补地面草），和远景同一规则。
// 交界：导入的列和远景的列直接挨着。离线算的地面和游戏大部分列一样，交界高差主要来自远景网格 32 米插值和离线算不出的峡谷、小湖：工具/导入/交界.ts 量出交界每 16 米的高差，
//   远景在交界外 256 米里渐变补上（取 <远景包>/交界.<导入包>.*，没有就不修并在控制台提示）。核对见 预览/主世界远景/ 的交界特写。
// 重算顺序（导入包或修整包换了）：npm run 远景:主世界-116（只在修整包或种子变了时）→ 远景:中层 → 远景:细带（导入范围变了也要）→ 远景:交界（导入包每次重新烘焙后）→ 远景:海底（导入包换了、群系多了时）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import { fetchGunzip, fetchJsonIfAny, loadOnce } from '../core/数据源.ts';
import type { V3 } from '../model/parts.tsx';
import { blockNames, blockProps, blockTint, voxelFromState } from './真实方块表.ts';
import { useImportedTerrain, type LandmarkCutout, type ImportedTerrain, type FlattenArea } from './导入地形.ts';
import { sectionCells } from './区段.ts';
import { coarseHeightAt, coarseHeightFingerprint, type 粗高度图 } from './区段包.ts';
import { packDir } from './区段包位置.ts';
import type { VoxelGrid, VoxelSource } from './生成.ts';
import { waterFreezes, distantSection, distantBiome, distantTop, loadDistantGrid, type GroundCorrection, type DistantGrid } from './远景.ts';
import { coarseSeaPlant } from './远景海底.ts';
import { coarseGroundPlant } from './远景地面草.ts';

export const overworldPack = '主世界-116';
export const overworldDistantPack = '主世界-116-远景';
// 远景兜底后看得到多远画多远：6-2-5 的雾浓到一半在 38～45 km（镜头/6-2-5/编排.ts 的 `visibility`），体素世界默认 24 km（lib/渲染级别.ts）会在雾还淡处截断，所以主世界镜头用 40 km
export const overworldFarM = 40000;
// 基地窗外（基地屋里朝东窗、南窗看海）：雾按能见度 12 km（`<FlightFog visibility={overworldWindowView.visibility} />`），体素世界只画到 30 km（`<VoxelWorld 远={overworldWindowView.远} … />`，不用 地形.远）。
// 为什么：修整包只保证窗外 30°～240° 的 30 km 里是海，再往外是陆地；按 6-2-5 低空 38 km 雾，东窗 55°～125°、南窗 145°～215° 的地平线会露出 30～43 km 的陆地和雪山头，而场景描述（归档的 v.md）写的窗外是「一直铺到天边淡淡的海雾里」。
// FlightFog 是 exp²，雾 = 1 − 2^−(距离/能见度)²：12 km 雾到 30 km 浓到 98.7%，30 km 外看不见；15 km 雾到 30 km 是 94%，雪山头还隐约透出，所以取 12 km（预览 主世界远景/00～03）。
export const overworldWindowView = { visibility: 12000, 远: 30000 };

export type 主世界地形 = {
  键: string; // 体素世界的缓存键
  来源: VoxelSource;
  高度: [number, number]; // 场景 z 的范围，给 体素世界 的 高度
  远: number;
  位置: (gamePos: number[]) => V3;
  地面: (x: number, y: number) => number;
  导入: ImportedTerrain;
  网格: DistantGrid;
};

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

// 交界修正（工具/导入/交界.ts 写）：16 米一格的 Int16（分米），场景坐标（导入包原点）；双线性取，格外是 0。依据：导入包粗高度图的指纹、远景各加密层块数
type Seam = { x0: number; y0: number; cellSize: number; nx: number; ny: number; deltas: Int16Array; basis?: { coarseHeightFingerprint: string; distantLayers: string[] } };
// distantDir：远景包的版本目录（packDir）
const loadSeam = (distantDir: string, packName: string) =>
  loadOnce(`${distantDir}/交界.${packName}`, async (): Promise<Seam | null> => {
    const meta = await fetchJsonIfAny<{ x0: number; y0: number; 格: number; nx: number; ny: number; 依据?: Seam['basis'] }>(`${distantDir}/交界.${packName}.json`);
    if (!meta) {
      console.warn(`主世界地形：${distantDir} 里没有 交界.${packName}.json，交界不修（跑 工具/导入/交界.ts）`);
      return null;
    }
    const deltas = new Int16Array(await fetchGunzip(`${distantDir}/交界.${packName}.bin.gz`));
    return { x0: meta.x0, y0: meta.y0, cellSize: meta.格, nx: meta.nx, ny: meta.ny, deltas: deltas, basis: meta.依据 };
  });
const seamCorrection = (J: Seam, origin: number[]): GroundCorrection => (gx, gz) => {
  const gridU = (gx - origin[0] - J.x0) / J.cellSize - 0.5;
  const gridV = (origin[2] - gz - J.y0) / J.cellSize - 0.5;
  const i = Math.floor(gridU), j = Math.floor(gridV);
  if (i < -1 || j < -1 || i >= J.nx || j >= J.ny) return 0;
  const at = (a: number, b: number) => (a < 0 || b < 0 || a >= J.nx || b >= J.ny ? 0 : J.deltas[b * J.nx + a] / 10);
  const fu = gridU - i, fv = gridV - j;
  const d00 = at(i, j), d10 = at(i + 1, j), d01 = at(i, j + 1), d11 = at(i + 1, j + 1);
  return d00 + (d10 - d00) * fu + (d01 - d00) * fv + (d00 - d10 - d01 + d11) * fu * fv;
};

export const buildOverworld = (imported: ImportedTerrain, grid: DistantGrid, seam: Seam | null): Omit<主世界地形, '键' | '远'> => {
  // 交界修正是不是对着手上这版导入包、远景包算的：导入范围或加密层变了，旧修正修不到新交界
  if (seam) {
    const fingerprint = coarseHeightFingerprint(imported.粗), layerSig = grid.层.map((F) => `${F.名}:${F.块.size}`).join(',');
    if (seam.basis?.coarseHeightFingerprint !== fingerprint || seam.basis?.distantLayers.join(',') !== layerSig)
      console.warn(`主世界地形：交界修正（${grid.packName}/交界.*）不是按现在的导入包、远景包算的，交界会有台阶，重跑 npm run 远景:交界`);
  }
  const origin = imported.原点;
  const [ox, oy, oz] = origin;
  const correction = seam ? seamCorrection(seam, origin) : undefined;
  const coarseHeights = imported.粗;
  const baseSource = imported.来源;
  // 远景这一处的地物顶（场景 z）：地面、水面，不算树（只给 选区段 估距离、给 地形跟随 当地面用，树冠差几米不要紧）
  const distantGround = (x: number, y: number) => {
    const groundY = distantTop(grid, x + ox, oz - y) + (correction ? correction(x + ox, oz - y) : 0);
    return Math.max(Math.round(groundY) + 1 - oy, grid.海平面 - oy);
  };
  const groundAt = (x: number, y: number) => {
    const coarseTop = coarseHeightAt(coarseHeights, x, y);
    return coarseTop === -Infinity ? distantGround(x, y) : coarseTop;
  };
  const source: VoxelSource = {
    采样: (x, y, out) => {
      out.z = groundAt(x, y);
      out.crown = 0;
    },
    区段: (section) => {
      const voxels = baseSource.区段!(section);
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
    },
    prefetch: baseSource.prefetch,
  };
  // 竖直范围：导入的（维度下界 ～ 最高的方块顶）和远景网格最高处 + 最高的树
  let maxHeight = -Infinity;
  for (const height of grid.高) if (height > maxHeight) maxHeight = height;
  return {
    来源: source,
    高度: [imported.高度[0], Math.max(imported.高度[1], maxHeight + 1 - oy + 26)],
    位置: imported.位置,
    地面: groundAt,
    导入: imported,
    网格: grid,
  };
};

const noCutouts: LandmarkCutout[] = [];
const noFlatten: FlattenArea[] = [];
// 包名、远景包 在各帧要一样（换了要重新取、重新建来源）。
// `挖掉`、`平整`：导入地形上要挖掉的地标、要整平的地（见 导入地形.ts），各帧同一个数组；`改动名` 并进缓存键，改动不同的来源不能共用缓存（边城整平、竖井挖开见 镜头/6-3-下坠/地形.ts）
export const useOverworldTerrain = (packName = overworldPack, distantPack = overworldDistantPack, cutouts: LandmarkCutout[] = noCutouts, flattenAreas: FlattenArea[] = noFlatten, editName = ''): 主世界地形 | null => {
  const imported = useImportedTerrain(packName, cutouts, flattenAreas);
  const [gridAndSeam, setGridAndSeam] = useState<[DistantGrid, Seam | null] | null>(null);
  const distantDir = packDir(distantPack);
  const [handle] = useState(() => delayRender(`主世界地形：取 ${distantDir}`));
  const released = useRef(false);
  useEffect(() => {
    Promise.all([loadDistantGrid(distantDir, distantPack), loadSeam(distantDir, packName)])
      .then(setGridAndSeam)
      .catch((e) => cancelRender(e));
  }, [distantDir, distantPack, packName]);
  const worldKey = `主世界:${packDir(packName)}+${distantDir}${editName ? `+${editName}` : ''}`;
  const terrain = useMemo(() => (imported && gridAndSeam ? { ...buildOverworld(imported, gridAndSeam[0], gridAndSeam[1]), 键: worldKey, 远: overworldFarM } : null), [imported, gridAndSeam, worldKey]);
  // 和 use导入地形 一样，等用到地形的子组件（体素世界）这一次渲染完、挂上它自己的 delayRender 以后再放行
  useEffect(() => {
    if (!terrain || released.current) return;
    released.current = true;
    continueRender(handle);
  }, [terrain, handle]);
  return terrain;
};
