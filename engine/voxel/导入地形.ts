// 导入地形：把存档导入的区段包（格式见 engine/voxel/区段包.ts）接进体素世界。
// 包在数据根的 terrain/<包名>/<版本>/ 下（engine/voxel/区段包位置.ts），经 engine/core/数据源.ts 取（取包时定下版本目录，同一个包的文件都从这一版取）：
//   包.json 一开始就取（粗高度图要同步查）；区段按每帧要的现取：块文件先按 Range 取头部索引，再按 Range 取那一段，解开 gzip。
//   编排用的粗高度是冻结进仓库的那份（engine/voxel/冻结粗高度.ts），包.json 取到后和它比一次指纹，对不上只报警。
//   解开的区段留着给同标签页的各帧、各来源共用，按最近用到淘汰，总量有上限（见 `maxCachedBytes`）。
// 解出来的区段上再做两件事：
//   挖掉地标：地标是 mcai mesh 导出的网格（资产 网格/<地标>/…），范围里导入的方块和网格会画两遍互相闪，按网格的 from / to 挖掉。
//     格子中心在范围里就挖（粗级格子跨边时按中心归一边，最多差半格）。导出时 skip 掉、游戏里却看得到的方块（终焉高原城堡去掉的树和荆棘）不挖（见 `LandmarkCutout`）。
//   随位置变的群系色：原版沼泽、暮色魔法森林、黑暗森林中心、幽暗森林的草和树叶随方块坐标变，这里按格子坐标重算（engine/voxel/群系色.ts；
//     不做群系间混合，用户 10-04 定的颜色规则，和导出网格一致）。粗级按格子最小角那一块算。
import { useEffect, useRef, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import { fetchJson, fetchRange, loadOnce } from '../core/数据源.ts';
import type { V3 } from '../model/parts.tsx';
import { blockTint, blockProps, voxelFromState } from './真实方块表.ts';
import type { TerrainSampler } from './地表.ts';
import { sectionKey, type SectionId } from './区段.ts';
import { sectionInTile, sectionToVoxels, tileFileName, tileHeaderLen, buildPackTables, noBiome, hasSection, coarseHeightAt, decodeTileHeader, decodeSection, decodeCoarseHeight, type 包信息, type 包表, type SectionData, type 粗高度图 } from './区段包.ts';
import { checkFrozenCoarse } from './冻结粗高度.ts';
import { packDir } from './区段包位置.ts';
import { variesByPos } from './群系色.ts';
import type { VoxelGrid, VoxelSource } from './生成.ts';

// 维度的下界（游戏 y）：暮色森林的维度从 y −32 起，主世界 −64
const dimensionMinY: Record<string, number> = { 暮色: -32, 主世界: -64 };

// 解开的区段总共留多少（字节，一个标签页）：取过的全留着会一直涨。
// 区段建成网格后数据就用不到了，只有网格被体素世界缓存挤掉、镜头又回来时要重建。超了在下一次 `prefetch` 时丢最久没用到的，这一次要的不丢（一帧要的比上限多也不会来回丢了重取）
const maxCachedBytes = 256 * 1024 * 1024;
type CachedSection = { d: SectionData; bytes: number; lastRound: number }; // 次：最后一次被 预取 要到是第几次
type 包 = {
  name: string;
  dir: string; // 取的是哪一版：packDir 的结果，块文件都从这里取
  info: 包信息;
  tables: 包表;
  coarseHeights: 粗高度图;
  maxTop: number; // 粗高度图里最高的顶（场景 z）
  variesByPos: boolean[]; // 按包里的群系号
  index: Map<string, Promise<Uint32Array>>; // 块文件名 → 索引
  data: Map<string, CachedSection>; // 按最近用到的先后排（Map 按插入顺序，用到一次挪到最后）
  bytes: number;
  round: number; // 预取 调了几次
  inflight: Map<string, Promise<void>>;
};
const loadPack = (dir: string, packName: string): Promise<包> =>
  loadOnce(dir, async () => {
    const info = await fetchJson<包信息>(`${dir}/包.json`, '先烘焙：见 工具/导入/烘焙.ts');
    const coarseHeights = decodeCoarseHeight(info);
    checkFrozenCoarse(packName, coarseHeights);
    let maxTop = -Infinity;
    for (const height of coarseHeights.高) if (height !== -32768) maxTop = Math.max(maxTop, height);
    return { name: packName, dir: dir, info: info, tables: buildPackTables(info), coarseHeights: coarseHeights, maxTop: maxTop, variesByPos: info.群系.map(variesByPos), index: new Map(), data: new Map(), bytes: 0, round: 0, inflight: new Map() };
  });

const loadTileIndex = (pack: 包, fileName: string) => {
  let promise = pack.index.get(fileName);
  if (!promise) {
    promise = fetchRange(`${pack.dir}/${fileName}`, 0, tileHeaderLen).then((ab) => decodeTileHeader(new Uint8Array(ab)));
    pack.index.set(fileName, promise);
  }
  return promise;
};
const loadSection = async (pack: 包, section: SectionId, requestRound: number) => {
  const { ti, tj, slot: entry } = sectionInTile(section);
  const fileName = tileFileName(ti, tj);
  const index = await loadTileIndex(pack, fileName);
  const data = decodeSection(new Uint8Array(await fetchRange(`${pack.dir}/${fileName}`, index[2 * entry], index[2 * entry + 1], true)));
  const bytes = data.palette.byteLength + data.runCounts.byteLength + data.paletteIndex.byteLength + data.runLengths.byteLength;
  pack.data.set(sectionKey(section), { d: data, bytes: bytes, lastRound: requestRound });
  pack.bytes += bytes;
  pack.inflight.delete(sectionKey(section));
};

// 要挖掉的地标网格：from、to 是 *.网格.json 的导出范围（游戏坐标，都含）；
// 留：网格导出时 skip 掉、但游戏里看得到的方块（mcai mesh 的 skip 写法：方块 id 冒号后面的部分，* 通配），范围里照样由导入的地形画。
// 终焉高原城堡 skip 了周围的树、草和荆棘，网格里那片是秃的，被树干挡掉顶面的洞要靠导入的方块补上
export type LandmarkCutout = { from: number[]; to: number[]; 留?: string[] };
type CutBox = { 盒: number[]; 留: RegExp | null };
const globRegex = (pats: string[]) => new RegExp(`^(${pats.map((p) => p.replace(/\*/g, '.*')).join('|')})$`); // 写法里只有小写字母、下划线和 *

// 场景盒子 [x0, y0, z0, x1, y1, z1] 里格子中心落在里面的格子挖空（留 的方块不挖）
const carveOut = (voxels: VoxelGrid, data: SectionData, pack: 包, cutBoxes: CutBox[]) => {
  const { nx, ny, nz, 格: cellM, 原点: origin, vox } = voxels;
  // 下标 a 的格子中心：原点 + (a − 1 + 0.5)·s（x、y 有一圈相邻格），z 是 原点 + (k + 0.5)·s
  const cellRange = (lo: number, hi: number, o: number, off: number, n: number): [number, number] => [
    Math.max(0, Math.ceil((lo - o) / cellM - 0.5 + off)),
    Math.min(n - 1, Math.ceil((hi - o) / cellM - 0.5 + off) - 1),
  ];
  for (const { 盒: [x0, y0, z0, x1, y1, z1], 留: keepRe } of cutBoxes) {
    const [a0, a1] = cellRange(x0, x1, origin[0], 1, nx);
    const [b0, b1] = cellRange(y0, y1, origin[1], 1, ny);
    const [k0, k1] = cellRange(z0, z1, origin[2], 0, nz);
    if (a0 > a1) continue; // 不跳过的话 fill 的终点算出负数，会从数组末尾倒着数、清掉一大片
    if (!keepRe) {
      for (let k = k0; k <= k1; k++) for (let j = b0; j <= b1; j++) vox.fill(0, (k * ny + j) * nx + a0, (k * ny + j) * nx + a1 + 1);
      continue;
    }
    // 色板号 → 留不留（状态串 "ns:名[属性]" 取冒号后、方括号前的名字比）
    const keepByPalette = Uint8Array.from({ length: data.palette.length / 2 }, (_, p) => (keepRe.test(pack.info.状态[data.palette[2 * p]].replace(/^[^:]*:|\[.*$/g, '')) ? 1 : 0));
    for (let k = k0; k <= k1; k++)
      for (let j = b0; j <= b1; j++)
        for (let col = a0; col <= a1; col++) {
          const at = (k * ny + j) * nx + col;
          if (!keepByPalette[vox[at]]) vox[at] = 0;
        }
  }
};

// 每列有没有方块（1 = 有），下标 y * nx + x
const filledColumns = (voxels: VoxelGrid) => {
  const colCount = voxels.nx * voxels.ny;
  const filled = new Uint8Array(colCount);
  for (let column = 0; column < colCount; column++)
    for (let k = 0; k < voxels.nz; k++)
      if (voxels.vox[k * colCount + column]) {
        filled[column] = 1;
        break;
      }
  return filled;
};

// 平整：一片地按列整平，给建在真实地形上的东西（边城：城里导入的地形挖掉、地面以下补实心地基，城外不动，城墙脚自然接上）。
// 罩：游戏方块列 [x0, x0 + nx) × [z0, z0 + nz) 每列一个值，0 = 不动，k ≥ 1 = 整平：`地面y` 以上挖空，以下（区段存的范围里）全换成 `填`[k − 1]。
// 粗级格子按中心那一列查罩；竖直方向格子底低于地面顶面就算地面以下（同 Mipper）。
// 区段只存地表附近（区段包.ts 的 `k底`），整平后的地面可能比存的范围高或低（`k底` 在地面顶以上时，下面「当实心」的格子不画顶面，挖开就是看穿的洞），
// 所以罩碰到的区段先把竖直范围扩到地面顶上下各一格，往下扩出来的格子填石头。
// `有盖`：和 `填` 一一对应，true 表示填方上面另有东西盖着（边城城墙里面是城自己的石半砖地面）。粗级格子的地面顶面不在格子边界上，
// 按「有一块实心就是实心」往上取整会让填方顶高出地面（远看街道被泥土埋住、只露房顶）。有盖的往下取整，缝被上面的地面盖住；没盖的（城墙脚外露的圆石）仍往上取整，免得露缝。
export type FlattenArea = { x0: number; z0: number; nx: number; nz: number; 罩: Uint8Array; 地面y: number; fillBlocks: string[]; covered?: boolean[] };

const flatten = (voxels: VoxelGrid, pack: 包, areas: FlattenArea[]): VoxelGrid => {
  const [ox, oy, oz] = pack.info.原点;
  const cellM = voxels.格;
  const { nx, ny } = voxels;
  const colCount = nx * ny;
  for (const area of areas) {
    // 每列查罩（下标 a 的格子中心 x = 原点 + (a − 0.5)·s，见 挖）
    const maskByCol = new Uint8Array(colCount);
    let anyHit = false;
    for (let j = 0; j < ny; j++) {
      const gz = Math.floor(oz - (voxels.原点[1] + (j - 0.5) * cellM)) - area.z0;
      if (gz < 0 || gz >= area.nz) continue;
      for (let col = 0; col < nx; col++) {
        const gx = Math.floor(voxels.原点[0] + (col - 0.5) * cellM + ox) - area.x0;
        if (gx < 0 || gx >= area.nx) continue;
        const maskValue = area.罩[gz * area.nx + gx];
        if (maskValue) {
          maskByCol[j * nx + col] = maskValue;
          anyHit = true;
        }
      }
    }
    if (!anyHit) continue;
    const groundTop = area.地面y + 1 - oy; // 整平后地面的顶面（场景 z）
    const k0 = voxels.原点[2] / cellM;
    const k1 = k0 + voxels.nz;
    const n0 = Math.min(k0, Math.floor(groundTop / cellM) - 1);
    const n1 = Math.max(k1, Math.ceil(groundTop / cellM) + 1);
    if (n0 < k0 || n1 > k1) {
      const nz = n1 - n0;
      const vox = new Uint16Array(colCount * nz);
      vox.set(voxels.vox, (k0 - n0) * colCount);
      if (n0 < k0) {
        const stonePaletteIdx = voxels.色板.push({ v: voxelFromState('minecraft:stone'), c: [255, 255, 255] }) - 1;
        vox.fill(stonePaletteIdx, 0, (k0 - n0) * colCount);
      }
      voxels = { ...voxels, nz, 原点: [voxels.原点[0], voxels.原点[1], n0 * cellM], vox };
    }
    const fillPaletteIdx = area.fillBlocks.map((blockName) => voxels.色板.push({ v: voxelFromState(blockName), c: [255, 255, 255] }) - 1);
    // 格子底低于地面顶面的是 [0, kTop)；有盖的填方只填整格都在地面顶面以下的 [0, kTop有盖)
    const kTop = Math.ceil((groundTop - voxels.原点[2]) / cellM);
    const kTopCovered = Math.floor((groundTop - voxels.原点[2]) / cellM);
    for (let column = 0; column < colCount; column++) {
      const maskValue = maskByCol[column];
      if (!maskValue) continue;
      const topK = area.covered?.[maskValue - 1] ? kTopCovered : kTop;
      for (let k = 0; k < voxels.nz; k++) voxels.vox[k * colCount + column] = k < topK ? fillPaletteIdx[maskValue - 1] : 0;
    }
  }
  return voxels;
};

// 随位置变的群系里染色的格子，按格子最小角那一块（游戏坐标）重算颜色，色板跟着加项
const tintByPosition = (voxels: VoxelGrid, data: SectionData, pack: 包) => {
  const { tint: TINT } = blockProps;
  const entryCount = data.palette.length / 2;
  const biomeToRetint: (string | null)[] = []; // 色板号 → 要重算时是群系 id
  let anyRetint = false;
  for (let idx = 0; idx < entryCount; idx++) {
    const biomeIdx = data.palette[2 * idx + 1];
    const biomeName = idx > 0 && biomeIdx !== noBiome && TINT[voxels.色板[idx].v] && pack.variesByPos[biomeIdx] ? pack.info.群系[biomeIdx] : null;
    biomeToRetint.push(biomeName);
    if (biomeName) anyRetint = true;
  }
  if (!anyRetint) return;
  const [ox, , oz] = pack.info.原点;
  const { nx, ny, nz, 格: cellM, 原点: origin, vox, 色板: palette } = voxels;
  const paletteIdByKey = new Map<string, number>();
  for (let column = 0; column < nx * ny; column++) {
    const sceneX = origin[0] + ((column % nx) - 1) * cellM;
    const sceneY = origin[1] + (Math.floor(column / nx) - 1) * cellM;
    // 场景格 [Y, Y + s) 是游戏方块 z = oz − Y − s … oz − Y − 1（见 区段包.ts 的坐标），最小角那一块 z = oz − Y − s
    const gx = sceneX + ox, gz = oz - sceneY - cellM;
    for (let k = 0; k < nz; k++) {
      const at = k * nx * ny + column;
      const paletteIdx = vox[at];
      const biomeName = biomeToRetint[paletteIdx];
      if (!biomeName) continue;
      const voxel = palette[paletteIdx].v;
      const cc = blockTint(voxel, biomeName, gx, gz);
      const key = `${voxel},${cc}`;
      let i = paletteIdByKey.get(key);
      if (i === undefined) {
        i = palette.length;
        palette.push({ v: voxel, c: [(cc >> 16) & 255, (cc >> 8) & 255, cc & 255] });
        paletteIdByKey.set(key, i);
      }
      vox[at] = i;
    }
  }
};

export type ImportedTerrain = {
  键: string; // 体素世界的缓存键（带版本，换了版本不会接着用旧版建的网格）；同一个包要分开缓存的（挖法、补水不同）在后面接后缀
  来源: VoxelSource;
  高度: [number, number]; // 场景 z 的范围（维度下界 ～ 最高的方块顶），给 体素世界 的 高度
  位置: (gamePos: number[]) => V3; // 游戏坐标（连续）→ 场景坐标（摆地标网格：网格放在 位置(origin)）
  原点: [number, number, number]; // 包.json 的原点 [ox, oy, oz]（游戏坐标），换算见 区段包.ts 文件头
  粗: 粗高度图; // 粗高度图（16 米一格，−32768 = 这一格没数据，即导入范围外），engine/voxel/主世界地形.ts 拿它认导入范围
};

const buildTerrain = (pack: 包, cutouts: LandmarkCutout[], flattenAreas: FlattenArea[]): ImportedTerrain => {
  const [ox, oy, oz] = pack.info.原点;
  // 游戏方块范围（from、to 都含）→ 场景盒子 [x0, y0, z0, x1, y1, z1]
  const toSceneBox = (m: { from: number[]; to: number[] }) => [m.from[0] - ox, oz - 1 - m.to[2], m.from[1] - oy, m.to[0] + 1 - ox, oz - m.from[2], m.to[1] + 1 - oy];
  const cutBoxes: CutBox[] = cutouts.map((m) => ({ 盒: toSceneBox(m), 留: m.留 ? globRegex(m.留) : null }));
  // `选区段` 拿 `采样` 的 z 当这一带的地物顶。没数据的地方给 0 而不是 −Infinity：`选区段` 只在区段中心取一次，粗级大区段中心没数据、角上有数据时，按无限远算就永远不细分
  const sample: TerrainSampler = (x, y, out) => {
    const height = coarseHeightAt(pack.coarseHeights, x, y);
    out.z = height === -Infinity ? 0 : height;
    out.crown = 0;
  };
  const source: VoxelSource = {
    采样: sample,
    区段: (section) => {
      if (!hasSection(pack.coarseHeights, section)) return null;
      const data = pack.data.get(sectionKey(section))!.d;
      // 先整平、再挖：竖井那一块在城里，整平垫的地基也要一起挖开
      const voxels = flattenAreas.length ? flatten(sectionToVoxels(data, pack.tables), pack, flattenAreas) : sectionToVoxels(data, pack.tables);
      // 记下整列挖空的列（`体素块` 的 `挖空`）：主世界地形把整列空气当成「区块没生成」拿远景补上，不记的话地标网格里会长出远景的草地和树
      const filledBefore = cutBoxes.length ? filledColumns(voxels) : null;
      carveOut(voxels, data, pack, cutBoxes);
      if (filledBefore) {
        const filledAfter = filledColumns(voxels);
        const carvedCols = filledBefore.map((v, c) => (v && !filledAfter[c] ? 1 : 0));
        if (carvedCols.includes(1)) voxels.挖空 = carvedCols;
      }
      tintByPosition(voxels, data, pack);
      return voxels;
    },
    prefetch: (qs) => {
      const round = ++pack.round;
      const waits: Promise<void>[] = [];
      for (const section of qs) {
        const k = sectionKey(section);
        const cached = pack.data.get(k);
        if (cached) {
          pack.data.delete(k); // 挪到最后
          pack.data.set(k, cached);
          cached.lastRound = round;
          continue;
        }
        if (!hasSection(pack.coarseHeights, section)) continue;
        let promise = pack.inflight.get(k);
        if (!promise) {
          promise = loadSection(pack, section, round);
          promise.catch((err) => cancelRender(err));
          pack.inflight.set(k, promise);
        }
        waits.push(promise);
      }
      for (const [k, cached] of pack.data) {
        if (pack.bytes <= maxCachedBytes || cached.lastRound === round) break;
        pack.data.delete(k);
        pack.bytes -= cached.bytes;
      }
      return waits.length ? Promise.all(waits).then(() => undefined) : undefined;
    },
  };
  return {
    键: `导入:${pack.dir}`,
    来源: source,
    高度: [dimensionMinY[pack.info.维度] - oy, pack.maxTop],
    位置: (g) => [g[0] - ox, oz - g[2], g[1] - oy],
    原点: pack.info.原点,
    粗: pack.coarseHeights,
  };
};

// 包名：区段包的名字（数据根 渲染/区段包/ 下的目录名，版本按 区段包版本.json），如 '暮色-远景片场'。挖掉：要挖掉的地标网格（见 地标挖框）；平整：按列整平的地（见 平整）。
// 包.json 取到之前返回 null，并用 delayRender 拦住截图。挖掉、平整 在各帧要是同一个数组（放在模块顶层）：换了要异步重建来源，中间那一帧还是旧的
const noFlatten: FlattenArea[] = [];
export const useImportedTerrain = (packName: string, cutouts: LandmarkCutout[], flattenAreas: FlattenArea[] = noFlatten): ImportedTerrain | null => {
  const [terrain, setTerrain] = useState<ImportedTerrain | null>(null);
  const dir = packDir(packName);
  const [handle] = useState(() => delayRender(`导入地形：取 ${dir}/包.json`));
  const released = useRef(false);
  useEffect(() => {
    loadPack(dir, packName)
      .then((b) => setTerrain(buildTerrain(b, cutouts, flattenAreas)))
      .catch((e) => cancelRender(e));
  }, [dir, packName, cutouts, flattenAreas]);
  // 放行要等用到地形的子组件（体素世界）这一次渲染完、挂上它自己的 delayRender 以后（子组件先渲染，effect 后跑）
  useEffect(() => {
    if (!terrain || released.current) return;
    released.current = true;
    continueRender(handle);
  }, [terrain, handle]);
  return terrain;
};
