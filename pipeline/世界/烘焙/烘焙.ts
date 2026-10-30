// 烘焙区段包：列段（一个区域一份）→ 区段包（格式和坐标见 engine/voxel/区段包.ts）。算法照旧项目 工具/导入/烘焙.ts，同样的列段烘出逐字节一样的包。
// - 按 2048 米一块分块，每块四周多带 64 列（最粗一级一格），多带的那圈和隔壁块算出来一样，块之间不用通信。
// - 往上每级 2×2 列并一列，每格照 Voxy 的 Mipper 从 2×2×2 子格挑代表（合并.ts）。
// - 染色方块照游戏重挑群系（BiomeManager.getBiome 的种子抖动），交界颜色和 mcai mesh 导出的地标网格一致。
// - 查不到的方块状态、群系照常烘焙，记进 缺失.tsv。
// 只管算和写进给定目录；版本、登记、锁在 版本.ts 和 命令.ts。
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { 包信息 } from '../../../engine/voxel/区段包.ts';
import type { 解开的列段 } from '../列段.ts';
import type { 体素库 } from '../体素库.ts';
import { 浮空下地表 } from './地表.ts';
import { 段缓冲, 合并一级, 无地表, 无顶, type 层级 } from './合并.ts';
import { 条目表, 不染色 } from './条目.ts';
import { 区段写手, type 级统计 } from './写区段.ts';

export type 烘焙参数 = {
  /** 这个包的区域（有数据的），[rx, rz] */
  区域们: (readonly [number, number])[];
  /** 取一个区域的列段；不在 区域们 里的返回 null（多带的那圈落到包外就当没数据） */
  取区域: (rx: number, rz: number) => 解开的列段 | null;
  /** 包.json 的 维度（暮色 / 主世界 …） */
  维度: string;
  /** 场景原点 [ox, oy, oz]：ox、oz 是 2048 的整数倍 */
  原点: readonly [number, number, number];
  输出: string;
  库: 体素库;
  日志?: (s: string) => void;
};

export type 烘焙结果 = { 包: 包信息; 缺状态: Map<string, number>; 缺群系: Map<string, number>; 级: 级统计[]; 块文件数: number; 条目数: number };

const 粗高度格 = 16; // 粗高度图一格 16 米

export const 烘焙 = async (p: 烘焙参数): Promise<烘焙结果> => {
  const { 库 } = p;
  const { coarsestLevel } = 库.区段;
  const tileCols = 库.区段包.tileSizeM;
  const [OX, OY, OZ] = p.原点;
  if (OX % tileCols || OZ % tileCols) throw new Error(`原点的 x、z 要是 ${tileCols} 的整数倍，给的是 ${OX},${OZ}`);
  if (!p.区域们.length) throw new Error('没有区域可烘');
  const padCols = 2 ** coarsestLevel; // 每块四周多带的列数
  const paddedCols = tileCols + 2 * padCols;
  const 表 = new 条目表(库.知识);
  const { entryState, entryBiome, entryFullCube, stateVoxel, biomeKnown, biomeList, stateList, missingStates, missingBiomes } = 表;
  const 有 = new Set(p.区域们.map(([rx, rz]) => `${rx},${rz}`));
  const loadRegion = (rx: number, rz: number) => (有.has(`${rx},${rz}`) ? p.取区域(rx, rz) : null);
  // 区域自己的 (状态, 群系) → 条目号、区域群系 → 群系号的缓存，挂在区域对象上（区域对象由 取区域 缓存，换了对象就重查，结果一样）
  const 区域缓存 = new WeakMap<解开的列段, { entryIds: Int32Array; biomeIds: Int32Array }>();
  const 缓存于 = (r: 解开的列段) => {
    let c = 区域缓存.get(r);
    if (!c) 区域缓存.set(r, (c = { entryIds: new Int32Array(r.状态表.length * r.群系表.length).fill(-1), biomeIds: new Int32Array(r.群系表.length).fill(-1) }));
    return c;
  };

  // ---------- 范围 ----------
  const [r0x, r0z] = p.区域们[0]!;
  const firstRegion = loadRegion(r0x, r0z);
  if (!firstRegion) throw new Error(`区域 r.${r0x}.${r0z} 没有数据`);
  const zb = firstRegion.y底 - OY; // 最低一格（场景 z）
  const zt = firstRegion.y顶 - OY;
  // 区域 (rx, rz) 在场景里：X ∈ [512rx − ox, 512rx + 512 − ox)，Y ∈ [oz − 512rz − 512, oz − 512rz)
  const regionX0 = (rx: number) => 512 * rx - OX;
  const regionY0 = (rz: number) => OZ - 512 * rz - 512;
  const tiles = new Map<string, [number, number]>();
  for (const [rx, rz] of p.区域们) {
    const ti = Math.floor(regionX0(rx) / tileCols), tj = Math.floor(regionY0(rz) / tileCols);
    tiles.set(`${ti},${tj}`, [ti, tj]);
  }
  const coarseX0 = Math.min(...p.区域们.map(([rx]) => regionX0(rx)));
  const coarseY0 = Math.min(...p.区域们.map(([, rz]) => regionY0(rz)));
  const coarseNx = (Math.max(...p.区域们.map(([rx]) => regionX0(rx))) + 512 - coarseX0) / 粗高度格;
  const coarseNy = (Math.max(...p.区域们.map(([, rz]) => regionY0(rz))) + 512 - coarseY0) / 粗高度格;
  const coarseHeights = new Int16Array(coarseNx * coarseNy).fill(无顶);

  // ---------- 方块在哪个群系 ----------
  // 游戏取方块群系不是直接取 pos >> 2，而是给相邻 8 个群系格按种子抖动后挑最近的（BiomeManager.getBiome，见 群系色.ts 的 biomeCell）。
  // 只有染色方块要挑；8 个候选都一样就不算抖动。y 超界按边界格取，挑中的格没数据就用自己那格。
  // 候选群系格摊成一张表，下标 ((qz − 格z0)·格宽 + qx − 格x0)·NQ + qy − qy底
  const qyBottom = firstRegion.y底 >> 2;
  const NQ = (firstRegion.y顶 - firstRegion.y底 + 1) >> 2;
  const zoomSeed = await 库.知识.群系缩放种子(firstRegion.种子);
  let cellBiomes = new Uint16Array(0);
  let cellX0 = 0, cellZ0 = 0, cellWidth = 0;
  // 游戏方块 x ∈ [x0, x0 + W)、z ∈ [z0, z0 + W) 要用到的群系格：x 的候选是 (x − 2) >> 2 和它 + 1
  const fillCellBiomes = (x0: number, z0: number, width: number) => {
    cellX0 = (x0 - 2) >> 2;
    cellZ0 = (z0 - 2) >> 2;
    cellWidth = ((x0 + width - 3) >> 2) + 2 - cellX0;
    if (cellBiomes.length < cellWidth * cellWidth * NQ) cellBiomes = new Uint16Array(cellWidth * cellWidth * NQ);
    for (let cellRow = 0; cellRow < cellWidth; cellRow++)
      for (let cellCol = 0; cellCol < cellWidth; cellCol++) {
        const x = 4 * (cellX0 + cellCol), z = 4 * (cellZ0 + cellRow);
        const rx = x >> 9, rz = z >> 9;
        const region = loadRegion(rx, rz);
        const col = (z - 512 * rz) * 512 + (x - 512 * rx);
        const cellBase = (cellRow * cellWidth + cellCol) * NQ;
        if (!region || !region.段数[col]) {
          cellBiomes.fill(不染色, cellBase, cellBase + NQ);
          continue;
        }
        const rc = 缓存于(region);
        // 群系格里的方块群系都一样，取格子最低那一格所在的段
        let runIdx = region.runStarts[col]!;
        for (let cellY = NQ - 1; cellY >= 0; cellY--) {
          while (region.底[runIdx]! > firstRegion.y底 + 4 * cellY) runIdx++;
          const lb = region.群系[runIdx]!;
          if (rc.biomeIds[lb]! < 0) rc.biomeIds[lb] = 表.internBiome(region.群系表[lb]!);
          cellBiomes[cellBase + cellY] = rc.biomeIds[lb]!;
        }
      }
  };
  // 一列 (x, z) 里 (y − 2) >> 2 = m 的那 4 格共用 8 个候选群系格：都是同一个群系就是它，不然返回 −1（要逐格算抖动）
  const uniformCandidateBiome = (x: number, qyBase: number, z: number) => {
    const m0 = Math.min(NQ - 1, Math.max(0, qyBase - qyBottom)), m1 = Math.min(NQ - 1, Math.max(0, qyBase + 1 - qyBottom));
    const baseIdx = ((((z - 2) >> 2) - cellZ0) * cellWidth + ((x - 2) >> 2) - cellX0) * NQ, dx = NQ, dz = cellWidth * NQ;
    const biome = cellBiomes[baseIdx + m0]!;
    return biome !== 不染色 &&
      cellBiomes[baseIdx + m1] === biome &&
      cellBiomes[baseIdx + dx + m0] === biome &&
      cellBiomes[baseIdx + dx + m1] === biome &&
      cellBiomes[baseIdx + dz + m0] === biome &&
      cellBiomes[baseIdx + dz + m1] === biome &&
      cellBiomes[baseIdx + dz + dx + m0] === biome &&
      cellBiomes[baseIdx + dz + dx + m1] === biome
      ? biome
      : -1;
  };
  // 游戏方块 (x, y, z) 按抖动挑中的群系号；ownBiome：它自己那个群系格的
  const jitteredBiome = (x: number, y: number, z: number, ownBiome: number) => {
    const [qx, qy, qz] = 库.知识.群系格(zoomSeed, x, y, z);
    const picked = cellBiomes[((qz - cellZ0) * cellWidth + qx - cellX0) * NQ + Math.min(NQ - 1, Math.max(0, qy - qyBottom))]!;
    return picked === 不染色 ? ownBiome : picked;
  };

  // ---------- 第 0 级：块（连同四周多带的）里每一列从列段取 ----------
  const buildLevel0 = (X0: number, Y0: number): 层级 => {
    const width = paddedCols;
    const runStarts = new Uint32Array(width * width + 1);
    const surfaces = new Int16Array(width * width).fill(无地表);
    const tops = new Int16Array(width * width).fill(无顶);
    const runBuf = new 段缓冲();
    fillCellBiomes(X0 + OX, OZ - Y0 - width, width);
    for (let gy = 0; gy < width; gy++) {
      const z = OZ - 1 - (Y0 + gy);
      const rz = Math.floor(z / 512);
      const coreRow = gy >= padCols && gy < padCols + tileCols;
      let region: 解开的列段 | null = null;
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
          const rc = 缓存于(region);
          const inCore = coreRow && gx >= padCols && gx < padCols + tileCols;
          const s0 = runBuf.n;
          const pushRun = (entry: number, bottom: number) => {
            if (runBuf.n > s0 && runBuf.entries[runBuf.n - 1] === entry) runBuf.bottoms[runBuf.n - 1] = bottom;
            else runBuf.push(entry, bottom);
          };
          let top = zt; // 这一段的顶
          for (let k = region.runStarts[col]!, ke = k + runCount; k < ke; k++) {
            const li = region.状态[k]! * region.群系表.length + region.群系[k]!;
            let entry = rc.entryIds[li]!;
            if (entry < 0) entry = rc.entryIds[li] = 表.internEntry(表.internState(region.状态表[region.状态[k]!]!), 表.internBiome(region.群系表[region.群系[k]!]!));
            const bottom = region.底[k]! - OY;
            const st = entryState[entry]!;
            if (inCore && st && !stateVoxel[st]) missingStates.set(stateList[st]!, (missingStates.get(stateList[st]!) ?? 0) + top - bottom + 1);
            if (surfaces[levelCol] === 无地表 && entryFullCube[entry]) surfaces[levelCol] = top + 1;
            if (tops[levelCol] === 无顶 && entry) tops[levelCol] = top;
            const ownBiome = entryBiome[entry]!;
            if (ownBiome === 不染色) pushRun(entry, bottom);
            // 染色的方块挑群系：候选格一样的一组（竖着最多 4 格）一起定，离交界近的逐格算抖动
            else
              for (let k2 = top; k2 >= bottom; ) {
                const qyBase = (k2 + OY - 2) >> 2;
                const groupBottom = Math.max(bottom, 4 * qyBase + 2 - OY);
                const groupBiome = uniformCandidateBiome(x, qyBase, z);
                if (groupBiome >= 0) {
                  if (inCore && !biomeKnown[groupBiome]) missingBiomes.set(biomeList[groupBiome]!, (missingBiomes.get(biomeList[groupBiome]!) ?? 0) + k2 - groupBottom + 1);
                  pushRun(groupBiome === ownBiome ? entry : 表.internEntry(st, groupBiome), groupBottom);
                  k2 = groupBottom - 1;
                  continue;
                }
                for (; k2 >= groupBottom; k2--) {
                  const pickedBiome = jitteredBiome(x, k2 + OY, z, ownBiome);
                  if (inCore && !biomeKnown[pickedBiome]) missingBiomes.set(biomeList[pickedBiome]!, (missingBiomes.get(biomeList[pickedBiome]!) ?? 0) + 1);
                  pushRun(pickedBiome === ownBiome ? entry : 表.internEntry(st, pickedBiome), k2);
                }
              }
            top = bottom - 1;
          }
          if (surfaces[levelCol] === 无地表) surfaces[levelCol] = zb; // 一列里没有整格方块：一直通到底
        }
        runStarts[levelCol + 1] = runBuf.n;
      }
    }
    const runEntries = runBuf.entries.slice(0, runBuf.n), runBottoms = runBuf.bottoms.slice(0, runBuf.n);
    浮空下地表(width, runStarts, runEntries, runBottoms, surfaces, entryFullCube, zb, zt);
    return { L: 0, W: width, kb: zb, kt: zt, runStarts, entries: runEntries, bottoms: runBottoms, surface: surfaces, tops };
  };

  // ---------- 主流程 ----------
  const 写手 = new 区段写手(库, 表, p.输出, padCols, tileCols);
  const t0 = performance.now();
  p.日志?.(`烘焙 → ${p.输出}\n  ${p.维度}，原点 游戏 (${OX}, ${OY}, ${OZ})，${p.区域们.length} 个区域、${tiles.size} 块（${tileCols} 米一块），z ${zb}～${zt}`);
  for (const [ti, tj] of [...tiles.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const X0 = ti * tileCols - padCols, Y0 = tj * tileCols - padCols;
    let level = buildLevel0(X0, Y0);
    // 粗高度：块核心里每 16 × 16 列取最高的顶
    for (let gy = padCols; gy < padCols + tileCols; gy++)
      for (let gx = padCols; gx < padCols + tileCols; gx++) {
        const colTop = level.tops[gy * paddedCols + gx]!;
        if (colTop === 无顶) continue;
        const k = Math.floor((Y0 + gy - coarseY0) / 粗高度格) * coarseNx + Math.floor((X0 + gx - coarseX0) / 粗高度格);
        coarseHeights[k] = Math.max(coarseHeights[k]!, colTop + 1);
      }
    写手.写一级(level, ti, tj);
    for (let levelNo = 1; levelNo <= coarsestLevel; levelNo++) {
      level = 合并一级(level, 表, 库.知识.合并键, zb, zt);
      写手.写一级(level, ti, tj);
    }
    写手.写块(ti, tj);
    p.日志?.(`  块 (${ti}, ${tj}) 完，累计 ${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
  }

  const 包: 包信息 = {
    版本: 1,
    维度: p.维度,
    原点: [OX, OY, OZ],
    状态: stateList,
    群系: biomeList,
    粗高度: { 格: 粗高度格, x0: coarseX0, y0: coarseY0, nx: coarseNx, ny: coarseNy, 高: Buffer.from(coarseHeights.buffer).toString('base64') },
  };
  writeFileSync(path.join(p.输出, '包.json'), JSON.stringify(包));
  const missingRows = [
    ...[...missingStates].sort((a, b) => b[1] - a[1]).map(([k, count]) => `状态\t${k}\t${count}`),
    ...[...missingBiomes].sort((a, b) => b[1] - a[1]).map(([k, count]) => `群系\t${k}\t${count}`),
  ];
  writeFileSync(path.join(p.输出, '缺失.tsv'), ['类\t名\t第0级格数', ...missingRows].join('\n') + '\n');
  return { 包, 缺状态: missingStates, 缺群系: missingBiomes, 级: 写手.levelStats, 块文件数: 写手.tileFileCount, 条目数: entryState.length };
};
