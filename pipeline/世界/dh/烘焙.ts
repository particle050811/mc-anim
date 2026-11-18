// 从 DH 的 LOD 库（读库.ts）烘区段包：我们的第 L 级直接取 DH 的第 L 级（两边一个区段都是 64 × 64 列、一列 2^L 米），不从第 0 级往上合并。
// 库里细的级只有玩家附近有，所以这种包各处最细能到哪一级不一样：
// - 最粗一级（默认第 6 级）铺满范围：DH 的同一级，没有的地方拿更粗的两级（第 6 级时是第 7、8 级，128、256 米一列）的列放大顶上。
// - 往下每一级：一个区段只要它的父区段里有 DH 原生的更细数据就写，四个兄弟一起写（挑区段是四叉树，要么四块都换细要么不换）；
//   兄弟里 DH 没有这一级的列，拿上一级的列放大顶上。
// - 包.json 多一项 splittable（engine/voxel/区段包.ts）：哪些区段能再往下细分。挑区段时不能分的就停在这一级。
// 竖直方向 DH 始终 1 格一档，这里按 2^L 米一格量化：段的交界取最近的格线，最上面那段非空气（地表的雪、草、水）至少留一格。
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultModel, modelBytes, modelFileName } from '../../../engine/voxel/区段模型.ts';
import type { SplittableBits } from '../../../engine/voxel/区段包.ts';
import type { VoxelLib } from '../体素库.ts';
import { finishPack, type BakeResult, type StagedPack } from '../烘焙/烘焙.ts';
import type { VisibleSettings } from '../烘焙/可见.ts';
import { noSurface, noTop, type Level } from '../烘焙/合并.ts';
import { EntryTable } from '../烘焙/条目.ts';
import { SectionWriter, defaultCoarsestLevel } from '../烘焙/写区段.ts';
import type { DhColumns, DhDb } from './读库.ts';

export type DhBakeParams = {
  db: DhDb;
  dimension: string;
  /** 场景原点 [ox, oy, oz]：ox、oz 是块边长（最粗级 6 是 4096）的整数倍（最粗一级的区段要和 DH 的对齐） */
  origin: readonly [number, number, number];
  /** 烘的范围，游戏坐标 [x0, z0, x1, z1)，对齐块边长 */
  extent: readonly [number, number, number, number];
  /** 高度范围（游戏 y，两端都含）：底 − oy、顶 + 1 − oy 都是最粗一级一格（最粗级 6 是 64 米）的倍数 */
  yRange: readonly [number, number];
  output: string;
  lib: VoxelLib;
  log?: (s: string) => void;
  visible?: VisibleSettings | null;
  /** 最粗一级（包.json 的 coarsestLevel），不给 = defaultCoarsestLevel */
  coarsestLevel?: number;
};

const coarseCellMeters = 64; // 粗高度图一格 = 第 0 级一个区段：各级区段有没有数据都能从它判
const SECTION = 64;
const depthCells = 64; // 地表往下留多少格（这一级的格）细节
const cacheLimit = 400;

export const bakeDh = async (p: DhBakeParams): Promise<BakeResult & { sectionCounts: number[] }> => {
  const { lib: voxelLib, db } = p;
  const coarsestLevel = p.coarsestLevel ?? defaultCoarsestLevel;
  const tileCols = voxelLib.sectionPack.tileSizeOf(coarsestLevel), topCell = 2 ** coarsestLevel;
  const [OX, OY, OZ] = p.origin;
  const [ex0, ez0, ex1, ez1] = p.extent;
  for (const v of [OX, OZ, ex0, ez0, ex1, ez1]) if (v % tileCols) throw new Error(`原点和范围的 x、z 要是 ${tileCols} 的整数倍，给的有 ${v}`);
  const zb = p.yRange[0] - OY, zt = p.yRange[1] - OY;
  if (zb % topCell || (zt + 1) % topCell || zt < zb) throw new Error(`yRange 减 oy 要对齐 ${topCell}（最粗一级的格），给的是 ${p.yRange.join('～')}`);
  const outDir = p.output;
  const staged = path.join(outDir, '.训练输入');
  mkdirSync(staged, { recursive: true });
  writeFileSync(path.join(staged, modelFileName), modelBytes(defaultModel()));
  const padCols = 2 ** coarsestLevel;
  const entryTable = new EntryTable(voxelLib.knowledge);
  const { entryFullCube, stateVoxel, missingStates, missingBiomes, biomeKnown } = entryTable;

  // 块 (ti, tj)：场景 X ∈ [ti·块边长, …)，Y ∈ [tj·块边长, …)；场景 Y = oz − 游戏 z
  const ti0 = (ex0 - OX) / tileCols, ti1 = (ex1 - OX) / tileCols;
  const tj0 = (OZ - ez1) / tileCols, tj1 = (OZ - ez0) / tileCols;
  // 我们的区段 (L, i, j) ↔ DH 的 (L, PosX, PosZ)：i = PosX − ox/边长，j = oz/边长 − 1 − PosZ
  const sectionSize = (L: number) => SECTION * 2 ** L;
  const inExtent = (L: number, i: number, j: number) => {
    const perTile = tileCols / sectionSize(L);
    return i >= ti0 * perTile && i < ti1 * perTile && j >= tj0 * perTile && j < tj1 * perTile;
  };
  const readOptions = (L: number) => ({ yFloor: p.yRange[0], worldTop: p.yRange[1], depth: depthCells * 2 ** Math.min(L, coarsestLevel) });
  // reach[L]：第 L 级的区段里，自己或者后代在 DH 里有原生数据的；splittable[L + 1]：有孩子在 reach[L] 里的父区段。
  // 「有原生数据」要读一遍才知道：库里细的级有大量区段一列有效的都没有（第 0 级 16784 个里 11736 个），照行表算会多写几倍放大出来的区段
  const key = (i: number, j: number) => `${i},${j}`;
  const reach: Set<string>[] = [];
  const splittable: Set<string>[] = [new Set()];
  const tScan = performance.now();
  for (let L = 0; L < coarsestLevel; L++) {
    const set = new Set<string>();
    for (const [px, pz] of db.sections(L)) {
      const i = px - OX / sectionSize(L), j = OZ / sectionSize(L) - 1 - pz;
      if (inExtent(L, i, j) && db.read(L, px, pz, readOptions(L))) set.add(key(i, j));
    }
    if (L > 0) for (const k of splittable[L]!) set.add(k);
    reach.push(set);
    const parents = new Set<string>();
    for (const k of set) {
      const [i, j] = k.split(',').map(Number) as [number, number];
      parents.add(key(i >> 1, j >> 1));
    }
    splittable.push(parents);
  }
  p.log?.(`DH 各级（0～${coarsestLevel - 1}）有原生数据的区段：${reach.map((r, L) => r.size - (L ? splittable[L]!.size : 0)).join('、')}（不算只因为后代进来的）；扫一遍 ${((performance.now() - tScan) / 1000).toFixed(1)} 秒`);

  // DH 区段读出来放一会儿（相邻区段的那一圈、相邻的块都要再用）
  const cache = new Map<string, DhColumns | null>();
  const dhSection = (L: number, px: number, pz: number) => {
    const k = `${L},${px},${pz}`;
    let v = cache.get(k);
    if (v !== undefined) {
      cache.delete(k);
      cache.set(k, v);
      return v;
    }
    v = db.read(L, px, pz, readOptions(L));
    cache.set(k, v);
    if (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
    return v;
  };
  // DH 的 (状态号, 群系号) → 条目号
  const entryIds = new Map<number, number>();
  const entryOf = (state: number, biome: number, cells: number) => {
    if (!state) return 0;
    const k = state * 65536 + biome;
    let e = entryIds.get(k);
    if (e === undefined) entryIds.set(k, (e = entryTable.internEntry(entryTable.internState(db.states[state]!), entryTable.internBiome(db.biomes[biome]!))));
    const st = entryTable.entryState[e]!;
    if (!stateVoxel[st]) missingStates.set(entryTable.stateList[st]!, (missingStates.get(entryTable.stateList[st]!) ?? 0) + cells);
    const bi = entryTable.entryBiome[e]!;
    if (bi !== voxelLib.sectionPack.noBiome && !biomeKnown[bi]) missingBiomes.set(entryTable.biomeList[bi]!, (missingBiomes.get(entryTable.biomeList[bi]!) ?? 0) + cells);
    return e;
  };

  // 粗高度图
  const coarseX0 = ti0 * tileCols, coarseY0 = tj0 * tileCols;
  const coarseNx = ((ti1 - ti0) * tileCols) / coarseCellMeters, coarseNy = ((tj1 - tj0) * tileCols) / coarseCellMeters;
  const coarseHeights = new Int16Array(coarseNx * coarseNy).fill(-32768);
  const raiseCoarse = (X: number, Y: number, topZ: number) => {
    const col = Math.floor((X - coarseX0) / coarseCellMeters), row = Math.floor((Y - coarseY0) / coarseCellMeters);
    if (col < 0 || row < 0 || col >= coarseNx || row >= coarseNy) return;
    const k = row * coarseNx + col;
    if (topZ > coarseHeights[k]!) coarseHeights[k] = topZ;
  };

  // 一级正在攒的列：段先按填的先后放，写之前排成按列的
  type Building = { L: number; W: number; kb: number; kt: number; off: Uint32Array; cnt: Uint16Array; filled: Uint8Array; surface: Int16Array; tops: Int16Array; entries: Uint16Array; bottoms: Int16Array; n: number };
  const newBuilding = (L: number): Building => {
    const W = (tileCols + 2 * padCols) >> L;
    return { L, W, kb: zb >> L, kt: zt >> L, off: new Uint32Array(W * W), cnt: new Uint16Array(W * W), filled: new Uint8Array(W * W), surface: new Int16Array(W * W).fill(noSurface), tops: new Int16Array(W * W).fill(noTop), entries: new Uint16Array(1 << 16), bottoms: new Int16Array(1 << 16), n: 0 };
  };
  const pushRun = (b: Building, col: number, entry: number, bottom: number) => {
    if (b.cnt[col] && b.entries[b.n - 1] === entry) {
      b.bottoms[b.n - 1] = bottom;
      return;
    }
    if (b.n === b.entries.length) {
      const e = new Uint16Array(b.n * 2), bt = new Int16Array(b.n * 2);
      e.set(b.entries);
      bt.set(b.bottoms);
      b.entries = e;
      b.bottoms = bt;
    }
    if (!b.cnt[col]) b.off[col] = b.n;
    b.entries[b.n] = entry;
    b.bottoms[b.n++] = bottom;
    b.cnt[col]!++;
  };
  const finishLevel = (b: Building): Level => {
    const cols = b.W * b.W;
    const runStarts = new Uint32Array(cols + 1);
    for (let c = 0; c < cols; c++) runStarts[c + 1] = runStarts[c]! + b.cnt[c]!;
    const entries = new Uint16Array(b.n), bottoms = new Int16Array(b.n);
    for (let c = 0; c < cols; c++) {
      const from = b.off[c]!, to = runStarts[c]!;
      for (let k = 0; k < b.cnt[c]!; k++) {
        entries[to + k] = b.entries[from + k]!;
        bottoms[to + k] = b.bottoms[from + k]!;
      }
    }
    return { L: b.L, W: b.W, kb: b.kb, kt: b.kt, runStarts, entries, bottoms, surface: b.surface, tops: b.tops };
  };

  /** DH 一列（dh 的第 c 列）量化成第 L 级的段，写进 b 的第 col 列；返回最高非空气格的 y */
  const quantize = (b: Building, col: number, dh: DhColumns, c: number) => {
    const cell = 2 ** b.L;
    let above = b.kt + 1; // 上一段的底（格号）：这一段从 above − 1 往下
    let sawSolid = false;
    const end = dh.start[c + 1]!;
    for (let r = dh.start[c]!; r < end; r++) {
      const state = dh.state[r]!;
      let q = r === end - 1 ? b.kb : Math.min(above, Math.max(b.kb, Math.round((dh.bottom[r]! - OY) / cell)));
      if (state && !sawSolid) {
        sawSolid = true;
        if (q >= above && above > b.kb) q = above - 1; // 地表那一段至少一格
        b.tops[col] = above - 1;
      }
      if (q >= above) continue;
      const entry = entryOf(state, dh.biome[r]!, (above - q) * cell ** 3);
      if (b.surface[col] === noSurface && entryFullCube[entry]) b.surface[col] = above * cell;
      pushRun(b, col, entry, q);
      above = q;
    }
    if (b.surface[col] === noSurface) b.surface[col] = zb;
    return dh.top[c]!;
  };
  /** 上一级（parent，已经排好）的一列放大一倍写进 b 的第 col 列 */
  const upsample = (b: Building, col: number, parent: Level, parentCol: number) => {
    for (let r = parent.runStarts[parentCol]!, end = parent.runStarts[parentCol + 1]!; r < end; r++) pushRun(b, col, parent.entries[r]!, parent.bottoms[r]! * 2);
    b.surface[col] = parent.surface[parentCol]!;
    if (parent.tops[parentCol] !== noTop) b.tops[col] = parent.tops[parentCol]! * 2 + 1;
  };

  const writer = new SectionWriter(voxelLib, entryTable, staged, padCols, coarsestLevel);
  const sectionCounts = new Array<number>(coarsestLevel + 1).fill(0);
  const nativeColumns = new Array<number>(coarsestLevel + 1).fill(0);
  const t0 = performance.now();
  p.log?.(`从 DH 库烘 → ${staged}\n  ${p.dimension}，原点 游戏 (${OX}, ${OY}, ${OZ})，范围 x ${ex0}～${ex1}、z ${ez0}～${ez1}（${(ti1 - ti0) * (tj1 - tj0)} 块），z ${zb}～${zt}`);
  let tilesDone = 0;
  for (let tj = tj0; tj < tj1; tj++)
    for (let ti = ti0; ti < ti1; ti++) {
      const X0 = ti * tileCols - padCols, Y0 = tj * tileCols - padCols;
      let parent: Level | null = null;
      const levels: { level: Level; wanted: (si: number, sj: number) => boolean }[] = [];
      for (let L = coarsestLevel; L >= 0; L--) {
        const cell = 2 ** L, perTile = tileCols / sectionSize(L), pad = padCols >> L;
        const wanted = (si: number, sj: number) => L === coarsestLevel || splittable[L + 1]!.has(key((ti * perTile + si) >> 1, (tj * perTile + sj) >> 1));
        let any = false;
        for (let sj = 0; sj < perTile && !any; sj++) for (let si = 0; si < perTile && !any; si++) any = wanted(si, sj);
        if (!any) break;
        any = false;
        const b = newBuilding(L);
        for (let sj = 0; sj < perTile; sj++)
          for (let si = 0; si < perTile; si++) {
            if (!wanted(si, sj)) continue;
            for (let ly = -1; ly <= SECTION; ly++)
              for (let lx = -1; lx <= SECTION; lx++) {
                const gx = pad + si * SECTION + lx, gy = pad + sj * SECTION + ly;
                const col = gy * b.W + gx;
                if (b.filled[col]) continue;
                b.filled[col] = 1;
                // 上一级没数据的列不要（各级有数据的范围一样，粗高度图才判得准）
                const parentCol = parent ? (gy >> 1) * parent.W + (gx >> 1) : -1;
                if (parent && parent.runStarts[parentCol + 1] === parent.runStarts[parentCol]) continue;
                // 这一列在游戏里：x 第 ax 列、z 第 az 列（这一级的列号）
                const ax = (X0 + gx * cell + OX) / cell, az = (OZ - (Y0 + gy * cell) - cell) / cell;
                let top = -Infinity;
                // 最粗一级 DH 没有的拿更粗的两级顶；别的级拿上一级放大
                for (let up = 0; up <= (parent ? 0 : 2); up++) {
                  const ux = Math.floor(ax / 2 ** up), uz = Math.floor(az / 2 ** up);
                  const dh = dhSection(L + up, Math.floor(ux / SECTION), Math.floor(uz / SECTION));
                  const c = (ux & 63) * SECTION + (uz & 63);
                  if (!dh || dh.start[c + 1] === dh.start[c]) continue;
                  top = quantize(b, col, dh, c);
                  if (!up) nativeColumns[L]!++;
                  break;
                }
                if (top === -Infinity && parent) upsample(b, col, parent, parentCol);
                if (b.cnt[col]) {
                  any = true;
                  raiseCoarse(X0 + gx * cell, Y0 + gy * cell, top === -Infinity ? (b.tops[col]! + 1) * cell : top - OY + 1);
                }
              }
          }
        if (!any) break;
        const level = finishLevel(b);
        levels.push({ level, wanted });
        parent = level;
      }
      if (levels.length) {
        for (const { level, wanted } of levels) {
          const before = writer.levelStats[level.L]!.count;
          writer.writeLevel(level, ti, tj, wanted);
          sectionCounts[level.L]! += writer.levelStats[level.L]!.count - before;
        }
        writer.writeBlock(ti, tj);
      }
      if (++tilesDone % 100 === 0) p.log?.(`  ${tilesDone} 块完，累计 ${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
    }
  p.log?.(`各级区段数（0～${coarsestLevel}）：${sectionCounts.join('、')}；DH 原生的列数：${nativeColumns.join('、')}`);

  // 能细分的区段，按级一张位图
  const splittableInfo: SplittableBits = [null];
  for (let L = 1; L <= coarsestLevel; L++) {
    const perTile = tileCols / sectionSize(L);
    const i0 = ti0 * perTile, j0 = tj0 * perTile, ni = (ti1 - ti0) * perTile, nj = (tj1 - tj0) * perTile;
    const bits = new Uint8Array(Math.ceil((ni * nj) / 8));
    for (const k of splittable[L]!) {
      const [i, j] = k.split(',').map(Number) as [number, number];
      const n = (j - j0) * ni + (i - i0);
      bits[n >> 3]! |= 1 << (n & 7);
    }
    splittableInfo.push({ i0, j0, ni, nj, bits });
  }
  const pack: StagedPack = {
    dimension: p.dimension,
    origin: [OX, OY, OZ],
    state: entryTable.stateList,
    biome: entryTable.biomeList,
    coarsestLevel,
    maps: { coarse: { cell: coarseCellMeters, x0: coarseX0, y0: coarseY0, nx: coarseNx, ny: coarseNy, height: coarseHeights }, splittable: splittableInfo },
  };
  return { ...(await finishPack({ staged, outDir, pack, entryTable, writer, lib: voxelLib, visible: p.visible, log: p.log })), sectionCounts };
};
