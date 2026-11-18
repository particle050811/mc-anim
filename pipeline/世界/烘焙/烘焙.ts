// 烘焙区段包：列段（一个区域一份）→ 区段包（格式和坐标见 engine/voxel/区段包.ts）。算法照旧项目 工具/导入/烘焙.ts，同样的列段烘出逐字节一样的包。
// - 按最粗一级的一个区段一块分块（默认最粗级 6、4096 米一块；格式 3 以前 2048），每块四周多带最粗一级一格的列，多带的那圈和隔壁块算出来一样，块之间不用通信。
// - 往上每级 2×2 列并一列，每格照 Voxy 的 Mipper 从 2×2×2 子格挑代表（合并.ts）。
// - 染色方块照游戏重挑群系（BiomeManager.getBiome 的种子抖动），交界颜色和 mcai mesh 导出的地标网格一致。
// - 查不到的方块状态、群系照常烘焙，记进 缺失.tsv。
// 只管算和写进给定目录；版本、登记、锁在 版本.ts 和 命令.ts。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultModel, modelBytes, modelFileName } from '../../../engine/voxel/区段模型.ts';
import { transcodeDir } from './转码.ts';
import type { VisibleSettings } from './可见.ts';
import { walkSections } from './读区段.ts';
import { writePackDoc, type PackDoc } from './包信息.ts';
import type { UnpackedColumnSegmentRegion } from '../列段.ts';
import type { VoxelLib } from '../体素库.ts';
import { surfaceUnderFloating } from './地表.ts';
import { SegmentBuffer, mergeLevel, noSurface, noTop, type Level } from './合并.ts';
import { EntryTable, noBiome } from './条目.ts';
import { SectionWriter, defaultCoarsestLevel, type LevelStats } from './写区段.ts';

/** 定稿前的包信息（包.json、粗图的内容） */
export type StagedPack = Omit<PackDoc, 'format' | 'extra'>;

export type BakeParams = {
  /** 这个包的区域（有数据的），[rx, rz] */
  regions: (readonly [number, number])[];
  /** 取一个区域的列段；不在 区域们 里的返回 null（多带的那圈落到包外就当没数据） */
  getRegion: (rx: number, rz: number) => UnpackedColumnSegmentRegion | null;
  /** 包.json 的 维度（暮色 / 主世界 …） */
  dimension: string;
  /** 场景原点 [ox, oy, oz]：ox、oz 是 2048 的整数倍 */
  origin: readonly [number, number, number];
  /** 有顶的维度（下界）：整个高度都存。地表不取「最高整格方块的顶」（那是基岩顶，底下的洞腔全丢），改取这一列最低的非整格方块的底，
   *  即从维度底往上那一摞实心的顶：熔岩海、洞腔、岩顶都在它上面，照存；它下面全是整格方块，照旧当实心不存。不给 = 照旧（露天维度），烘出来和以前逐字节一样 */
  fullHeight?: boolean;
  output: string;
  lib: VoxelLib;
  log?: (s: string) => void;
  /** 发光优先（合并.ts）：粗级合并时露在外面的发光方块优先，远处的熔岩、火不被合成岩石。世界声明 [bake] glowFirst，不给 = 照 Voxy 原样 */
  glowFirst?: boolean;
  /** 可见变换（可见.ts）：定稿时埋住的格换填充方块、封死的腔填实，保真范围原样。不给 = 原样（anim world bake 按世界声明总是给） */
  visible?: VisibleSettings | null;
  /** 最粗一级（包.json 的 coarsestLevel），不给 = defaultCoarsestLevel */
  coarsestLevel?: number;
};

export type BakeResult = { pack: StagedPack; missingStates: Map<string, number>; missingBiomes: Map<string, number>; 级: LevelStats[]; blockFileCount: number; entryCount: number };

const coarseCellMeters = 16; // 粗高度图一格 16 米

export const bake = async (p: BakeParams): Promise<BakeResult> => {
  const { lib: voxelLib } = p;
  const coarsestLevel = p.coarsestLevel ?? defaultCoarsestLevel;
  const tileCols = voxelLib.sectionPack.tileSizeOf(coarsestLevel);
  const [OX, OY, OZ] = p.origin;
  // 原点仍按 2048 对齐（世界声明的规矩，声明.ts）：块从原点起按 4096 米切，只要区域（512 米）不跨块；不改成 4096，现有声明和地标坐标都不用动
  if (OX % 2048 || OZ % 2048) throw new Error(`原点的 x、z 要是 2048 的整数倍，给的是 ${OX},${OZ}`);
  if (!p.regions.length) throw new Error('没有区域可烘');
  // 先落中性表的暂存包，等状态号和全部区段固定后再学一次；和转码共用定稿路径。
  const outDir = p.output;
  p = { ...p, output: path.join(outDir, '.训练输入') };
  mkdirSync(p.output, { recursive: true });
  writeFileSync(path.join(p.output, modelFileName), modelBytes(defaultModel()));
  const padCols = 2 ** coarsestLevel; // 每块四周多带的列数
  const paddedCols = tileCols + 2 * padCols;
  const entryTable = new EntryTable(voxelLib.knowledge);
  const { entryState, entryBiome, entryFullCube, stateVoxel, biomeKnown, biomeList, stateList, missingStates, missingBiomes } = entryTable;
  const regionKeys = new Set(p.regions.map(([rx, rz]) => `${rx},${rz}`));
  const loadRegion = (rx: number, rz: number) => (regionKeys.has(`${rx},${rz}`) ? p.getRegion(rx, rz) : null);
  // 区域自己的 (状态, 群系) → 条目号、区域群系 → 群系号的缓存，挂在区域对象上（区域对象由 取区域 缓存，换了对象就重查，结果一样）
  const regionCache = new WeakMap<UnpackedColumnSegmentRegion, { entryIds: Int32Array; biomeIds: Int32Array }>();
  const cacheKeyFor = (r: UnpackedColumnSegmentRegion) => {
    let c = regionCache.get(r);
    if (!c) regionCache.set(r, (c = { entryIds: new Int32Array(r.stateTable.length * r.biomeTable.length).fill(-1), biomeIds: new Int32Array(r.biomeTable.length).fill(-1) }));
    return c;
  };

  // ---------- 范围 ----------
  const [r0x, r0z] = p.regions[0]!;
  const firstRegion = loadRegion(r0x, r0z);
  if (!firstRegion) throw new Error(`区域 r.${r0x}.${r0z} 没有数据`);
  const zb = firstRegion.yBottom - OY; // 最低一格（场景 z）
  const zt = firstRegion.yTop - OY;
  // 区域 (rx, rz) 在场景里：X ∈ [512rx − ox, 512rx + 512 − ox)，Y ∈ [oz − 512rz − 512, oz − 512rz)
  const regionX0 = (rx: number) => 512 * rx - OX;
  const regionY0 = (rz: number) => OZ - 512 * rz - 512;
  const tiles = new Map<string, [number, number]>();
  for (const [rx, rz] of p.regions) {
    const ti = Math.floor(regionX0(rx) / tileCols), tj = Math.floor(regionY0(rz) / tileCols);
    tiles.set(`${ti},${tj}`, [ti, tj]);
  }
  const coarseX0 = Math.min(...p.regions.map(([rx]) => regionX0(rx)));
  const coarseY0 = Math.min(...p.regions.map(([, rz]) => regionY0(rz)));
  const coarseNx = (Math.max(...p.regions.map(([rx]) => regionX0(rx))) + 512 - coarseX0) / coarseCellMeters;
  const coarseNy = (Math.max(...p.regions.map(([, rz]) => regionY0(rz))) + 512 - coarseY0) / coarseCellMeters;
  const coarseHeights = new Int16Array(coarseNx * coarseNy).fill(noTop);

  // ---------- 方块在哪个群系 ----------
  // 游戏取方块群系不是直接取 pos >> 2，而是给相邻 8 个群系格按种子抖动后挑最近的（BiomeManager.getBiome，见 群系色.ts 的 biomeCell）。
  // 只有染色方块要挑；8 个候选都一样就不算抖动。y 超界按边界格取，挑中的格没数据就用自己那格。
  // 候选群系格按列（4 × 4 列一根）记成从上往下的群系段：第 c 根是 cellRunStarts[c]～cellRunStarts[c+1]，cellRunBottom 是这一段最低的群系格（qy − qyBottom），
  // 最后一段到 0。不摊成「格数 × NQ」的整表：几千格高的世界（立方存档）一块要几个 GB，而一根里的群系通常只有一两段。
  const qyBottom = firstRegion.yBottom >> 2;
  const NQ = (firstRegion.yTop - firstRegion.yBottom + 1) >> 2;
  const zoomSeed = await voxelLib.knowledge.biomeScaleSeed(firstRegion.seed);
  let cellRunStarts = new Uint32Array(0);
  let cellRunBottom = new Uint16Array(1 << 16);
  let cellRunBiome = new Uint16Array(1 << 16);
  let cellX0 = 0, cellZ0 = 0, cellWidth = 0;
  // 游戏方块 x ∈ [x0, x0 + W)、z ∈ [z0, z0 + W) 要用到的群系格：x 的候选是 (x − 2) >> 2 和它 + 1
  const fillCellBiomes = (x0: number, z0: number, width: number) => {
    cellX0 = (x0 - 2) >> 2;
    cellZ0 = (z0 - 2) >> 2;
    cellWidth = ((x0 + width - 3) >> 2) + 2 - cellX0;
    if (cellRunStarts.length < cellWidth * cellWidth + 1) cellRunStarts = new Uint32Array(cellWidth * cellWidth + 1);
    let n = 0;
    const pushRun = (bottomQ: number, biome: number) => {
      if (n === cellRunBottom.length) {
        const bottoms = new Uint16Array(n * 2), biomes = new Uint16Array(n * 2);
        bottoms.set(cellRunBottom);
        biomes.set(cellRunBiome);
        cellRunBottom = bottoms;
        cellRunBiome = biomes;
      }
      cellRunBottom[n] = bottomQ;
      cellRunBiome[n++] = biome;
    };
    for (let cellRow = 0; cellRow < cellWidth; cellRow++)
      for (let cellCol = 0; cellCol < cellWidth; cellCol++) {
        const x = 4 * (cellX0 + cellCol), z = 4 * (cellZ0 + cellRow);
        const rx = x >> 9, rz = z >> 9;
        const region = loadRegion(rx, rz);
        const col = (z - 512 * rz) * 512 + (x - 512 * rx);
        const cell = cellRow * cellWidth + cellCol;
        cellRunStarts[cell] = n;
        if (!region || !region.段数[col]) {
          pushRun(0, noBiome);
          continue;
        }
        const rc = cacheKeyFor(region);
        // 群系格里的方块群系都一样，取格子最低那一格（y = y底 + 4·格号）所在的段；一段里没有这样的 y 就不占群系格
        const first = n;
        let top = firstRegion.yTop;
        for (let runIdx = region.runStarts[col]!, end = region.runStarts[col + 1]!; runIdx < end; runIdx++) {
          const bottom = region.bottom[runIdx]!;
          const bottomQ = (bottom - firstRegion.yBottom + 3) >> 2;
          if (bottomQ <= (top - firstRegion.yBottom) >> 2) {
            const lb = region.biome[runIdx]!;
            if (rc.biomeIds[lb]! < 0) rc.biomeIds[lb] = entryTable.internBiome(region.biomeTable[lb]!);
            if (n > first && cellRunBiome[n - 1] === rc.biomeIds[lb]) cellRunBottom[n - 1] = bottomQ;
            else pushRun(bottomQ, rc.biomeIds[lb]!);
          }
          top = bottom - 1;
        }
      }
    cellRunStarts[cellWidth * cellWidth] = n;
  };
  // 第 cell 根群系格列里第 m 格（qy − qyBottom）的群系号
  const cellBiomeAt = (cell: number, m: number) => {
    let r = cellRunStarts[cell]!;
    while (cellRunBottom[r]! > m) r++;
    return cellRunBiome[r]!;
  };
  // 一列 (x, z) 里 (y − 2) >> 2 = m 的那 4 格共用 8 个候选群系格：都是同一个群系就是它，不然返回 −1（要逐格算抖动）
  const uniformCandidateBiome = (x: number, qyBase: number, z: number) => {
    const m0 = Math.min(NQ - 1, Math.max(0, qyBase - qyBottom)), m1 = Math.min(NQ - 1, Math.max(0, qyBase + 1 - qyBottom));
    const baseCell = (((z - 2) >> 2) - cellZ0) * cellWidth + ((x - 2) >> 2) - cellX0;
    const biome = cellBiomeAt(baseCell, m0);
    return biome !== noBiome &&
      cellBiomeAt(baseCell, m1) === biome &&
      cellBiomeAt(baseCell + 1, m0) === biome &&
      cellBiomeAt(baseCell + 1, m1) === biome &&
      cellBiomeAt(baseCell + cellWidth, m0) === biome &&
      cellBiomeAt(baseCell + cellWidth, m1) === biome &&
      cellBiomeAt(baseCell + cellWidth + 1, m0) === biome &&
      cellBiomeAt(baseCell + cellWidth + 1, m1) === biome
      ? biome
      : -1;
  };
  // 游戏方块 (x, y, z) 按抖动挑中的群系号；ownBiome：它自己那个群系格的
  const jitteredBiome = (x: number, y: number, z: number, ownBiome: number) => {
    const [qx, qy, qz] = voxelLib.knowledge.biomeCell(zoomSeed, x, y, z);
    const picked = cellBiomeAt((qz - cellZ0) * cellWidth + qx - cellX0, Math.min(NQ - 1, Math.max(0, qy - qyBottom)));
    return picked === noBiome ? ownBiome : picked;
  };

  // ---------- 第 0 级：块（连同四周多带的）里每一列从列段取 ----------
  const buildLevel0 = (X0: number, Y0: number): Level => {
    const width = paddedCols;
    const runStarts = new Uint32Array(width * width + 1);
    const surfaces = new Int16Array(width * width).fill(noSurface);
    const tops = new Int16Array(width * width).fill(noTop);
    const runBuf = new SegmentBuffer();
    fillCellBiomes(X0 + OX, OZ - Y0 - width, width);
    for (let gy = 0; gy < width; gy++) {
      const z = OZ - 1 - (Y0 + gy);
      const rz = Math.floor(z / 512);
      const coreRow = gy >= padCols && gy < padCols + tileCols;
      let region: UnpackedColumnSegmentRegion | null = null;
      let curRx = NaN;
      for (let gx = 0; gx < width; gx++) {
        const levelCol = gy * width + gx;
        const x = X0 + gx + OX;
        const rx = Math.floor(x / 512);
        if (rx !== curRx) {
          region = loadRegion(rx, rz);
          curRx = rx;
        }
        const col = (z - 512 * rz) * 512 + (x - 512 * rx);
        const runCount = region ? region.段数[col]! : 0;
        if (region && runCount) {
          const rc = cacheKeyFor(region);
          const inCore = coreRow && gx >= padCols && gx < padCols + tileCols;
          const s0 = runBuf.n;
          const pushRun = (entry: number, bottom: number) => {
            if (runBuf.n > s0 && runBuf.entries[runBuf.n - 1] === entry) runBuf.bottoms[runBuf.n - 1] = bottom;
            else runBuf.push(entry, bottom);
          };
          let top = zt; // 这一段的顶
          let lowestOpen = zt + 1; // 全高：最低的非整格方块（空气、熔岩、花草）的底；一列全是整格方块就留在最高一格上面
          for (let k = region.runStarts[col]!, ke = k + runCount; k < ke; k++) {
            const li = region.state[k]! * region.biomeTable.length + region.biome[k]!;
            let entry = rc.entryIds[li]!;
            if (entry < 0) entry = rc.entryIds[li] = entryTable.internEntry(entryTable.internState(region.stateTable[region.state[k]!]!), entryTable.internBiome(region.biomeTable[region.biome[k]!]!));
            const bottom = region.bottom[k]! - OY;
            const st = entryState[entry]!;
            if (inCore && st && !stateVoxel[st]) missingStates.set(stateList[st]!, (missingStates.get(stateList[st]!) ?? 0) + top - bottom + 1);
            if (p.fullHeight) {
              if (!entryFullCube[entry]) lowestOpen = bottom;
            } else if (surfaces[levelCol] === noSurface && entryFullCube[entry]) surfaces[levelCol] = top + 1;
            if (tops[levelCol] === noTop && entry) tops[levelCol] = top;
            const ownBiome = entryBiome[entry]!;
            if (ownBiome === noBiome) pushRun(entry, bottom);
            // 染色的方块挑群系：候选格一样的一组（竖着最多 4 格）一起定，离交界近的逐格算抖动
            else
              for (let k2 = top; k2 >= bottom; ) {
                const qyBase = (k2 + OY - 2) >> 2;
                const groupBottom = Math.max(bottom, 4 * qyBase + 2 - OY);
                const groupBiome = uniformCandidateBiome(x, qyBase, z);
                if (groupBiome >= 0) {
                  if (inCore && !biomeKnown[groupBiome]) missingBiomes.set(biomeList[groupBiome]!, (missingBiomes.get(biomeList[groupBiome]!) ?? 0) + k2 - groupBottom + 1);
                  pushRun(groupBiome === ownBiome ? entry : entryTable.internEntry(st, groupBiome), groupBottom);
                  k2 = groupBottom - 1;
                  continue;
                }
                for (; k2 >= groupBottom; k2--) {
                  const pickedBiome = jitteredBiome(x, k2 + OY, z, ownBiome);
                  if (inCore && !biomeKnown[pickedBiome]) missingBiomes.set(biomeList[pickedBiome]!, (missingBiomes.get(biomeList[pickedBiome]!) ?? 0) + 1);
                  pushRun(pickedBiome === ownBiome ? entry : entryTable.internEntry(st, pickedBiome), k2);
                }
              }
            top = bottom - 1;
          }
          if (p.fullHeight) surfaces[levelCol] = lowestOpen;
          else if (surfaces[levelCol] === noSurface) surfaces[levelCol] = zb; // 一列里没有整格方块：一直通到底
        }
        runStarts[levelCol + 1] = runBuf.n;
      }
    }
    const runEntries = runBuf.entries.slice(0, runBuf.n), runBottoms = runBuf.bottoms.slice(0, runBuf.n);
    if (!p.fullHeight) surfaceUnderFloating(width, runStarts, runEntries, runBottoms, surfaces, entryFullCube, zb, zt); // 全高的地表已经在所有空当下面
    return { L: 0, W: width, kb: zb, kt: zt, runStarts, entries: runEntries, bottoms: runBottoms, surface: surfaces, tops };
  };

  // ---------- 主流程 ----------
  const writer = new SectionWriter(voxelLib, entryTable, p.output, padCols, coarsestLevel);
  const t0 = performance.now();
  p.log?.(`烘焙 → ${p.output}\n  ${p.dimension}，原点 游戏 (${OX}, ${OY}, ${OZ})，${p.regions.length} 个区域、${tiles.size} 块（${tileCols} 米一块），z ${zb}～${zt}`);
  for (const [ti, tj] of [...tiles.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const X0 = ti * tileCols - padCols, Y0 = tj * tileCols - padCols;
    let level = buildLevel0(X0, Y0);
    // 粗高度：块核心里每 16 × 16 列取最高的顶
    for (let gy = padCols; gy < padCols + tileCols; gy++)
      for (let gx = padCols; gx < padCols + tileCols; gx++) {
        const colTop = level.tops[gy * paddedCols + gx]!;
        if (colTop === noTop) continue;
        const k = Math.floor((Y0 + gy - coarseY0) / coarseCellMeters) * coarseNx + Math.floor((X0 + gx - coarseX0) / coarseCellMeters);
        coarseHeights[k] = Math.max(coarseHeights[k]!, colTop + 1);
      }
    writer.writeLevel(level, ti, tj);
    for (let levelNo = 1; levelNo <= coarsestLevel; levelNo++) {
      level = mergeLevel(level, entryTable, voxelLib.knowledge.mergeKey, zb, zt, p.glowFirst === true);
      writer.writeLevel(level, ti, tj);
    }
    writer.writeBlock(ti, tj);
    p.log?.(`  块 (${ti}, ${tj}) 完，累计 ${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
  }

  const packInfo: StagedPack = {
    dimension: p.dimension,
    origin: [OX, OY, OZ],
    state: stateList,
    biome: biomeList,
    coarsestLevel,
    maps: { coarse: { cell: coarseCellMeters, x0: coarseX0, y0: coarseY0, nx: coarseNx, ny: coarseNy, height: coarseHeights } },
  };
  return finishPack({ staged: p.output, outDir, pack: packInfo, entryTable, writer, lib: voxelLib, visible: p.visible, log: p.log });
};

/** 定稿（各种烘法共用）：暂存目录里的块文件配上 包.json、缺失.tsv，学模型、做可见变换转成成品写进 outDir，暂存目录删掉 */
export const finishPack = async (o: { staged: string; outDir: string; pack: StagedPack; entryTable: EntryTable; writer: SectionWriter; lib: VoxelLib; visible?: VisibleSettings | null; log?: (s: string) => void }): Promise<BakeResult> => {
  const { missingStates, missingBiomes } = o.entryTable;
  writePackDoc(o.lib, o.staged, { ...o.pack, extra: {} });
  const missingRows = [
    ...[...missingStates].sort((a, b) => b[1] - a[1]).map(([k, count]) => `状态\t${k}\t${count}`),
    ...[...missingBiomes].sort((a, b) => b[1] - a[1]).map(([k, count]) => `群系\t${k}\t${count}`),
  ];
  writeFileSync(path.join(o.staged, '缺失.tsv'), ['类\t名\t第0级格数', ...missingRows].join('\n') + '\n');
  const training = await transcodeDir(o.staged, o.outDir, 1, undefined, o.visible);
  for (const st of o.writer.levelStats) st.bytes = 0;
  for (const s of walkSections(o.lib, o.outDir)) o.writer.levelStats[s.id.L]!.bytes += s.bytes.length;
  rmSync(o.staged, { recursive: true });
  if (o.visible) { const v = training.transformCounts; o.log?.(`可见变换：改了 ${v.changedSectionCount} 个区段（保真范围里原样 ${v.保真段} 个）；封腔填 ${v.filledCount}、埋格换 ${v.buriedCount}、邻圈换 ${v.邻圈}、核心边换 ${v.核心边} 格，填充 ${o.visible.fillBlock}`); }
  o.log?.(`模型 ${training.modelClassCount} 类、${training.modelBytesCount} 字节，训练 ${training.样本数} 区段；定稿完成`);
  return { pack: o.pack, missingStates, missingBiomes, 级: o.writer.levelStats, blockFileCount: o.writer.tileFileCount, entryCount: o.entryTable.entryState.length };
};
