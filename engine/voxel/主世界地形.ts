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
import { useImportedTerrain, type LandmarkCutout, type ImportedTerrain, type FlattenArea } from './导入地形.ts';
import { coarseHeightAt, coarseHeightFingerprint } from './区段包.ts';
import { packDir } from './区段包位置.ts';
import type { VoxelSource } from './生成.ts';
import { distantTop, loadDistantGrid, type DistantGrid } from './远景.ts';
import { completeOverworldSection, seamCorrection, type Seam, type OverworldContext } from './主世界区段.ts';
import { registerOverworld, buildOverworldMeshInPool } from './网格池.ts';

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

// 交界修正（工具/导入/交界.ts 写）：16 米一格的 Int16（分米），场景坐标（导入包原点）；双线性取，格外是 0。依据：导入包粗高度图的指纹、远景各加密层块数
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
export const buildOverworld = (imported: ImportedTerrain, grid: DistantGrid, seam: Seam | null): Omit<主世界地形, '键' | '远'> => {
  // 交界修正是不是对着手上这版导入包、远景包算的：导入范围或加密层变了，旧修正修不到新交界
  if (seam) {
    const fingerprint = coarseHeightFingerprint(imported.粗), layerSig = grid.层.map((F) => `${F.名}:${F.块.size}`).join(',');
    if (seam.basis?.粗高度指纹 !== fingerprint || seam.basis?.远景层.join(',') !== layerSig)
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
  const context: OverworldContext = { grid, origin, coarseHeights, seam };
  const workerContext = registerOverworld(context);
  const source: VoxelSource = {
    采样: (x, y, out) => {
      out.z = groundAt(x, y);
      out.crown = 0;
    },
    区段: (section) => completeOverworldSection(baseSource.区段(section), section, context),
    建网格: (section) => buildOverworldMeshInPool(baseSource.区段(section), section, workerContext),
    prefetch: baseSource.prefetch,
    转交: true, // 导入的体素块（来源 转交）就地改完交出去，远景、并列都是新建的
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
