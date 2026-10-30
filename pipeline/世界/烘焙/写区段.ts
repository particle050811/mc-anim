// 把一级的列切成区段、换成区段自己的色板、gzip，攒齐一块的各级后写成块文件（格式见 engine/voxel/区段包.ts）。照旧项目 工具/导入/烘焙/写区段.ts。
import { closeSync, openSync, writeSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { 体素库 } from '../体素库.ts';
import { 无地表, 无顶, type 层级 } from './合并.ts';
import { 条目上限, type 条目表 } from './条目.ts';

export type 级统计 = { count: number; bytes: number; rawBytes: number; runCount: number; cellCount: number };

export class 区段写手 {
  levelStats: 级统计[];
  tileFileCount = 0;
  private paletteIdx = new Int32Array(条目上限).fill(-1);
  private tileSections: { slot: number; gz: Uint8Array }[] = [];

  private 库: 体素库;
  private 表: 条目表;
  private 输出: string;
  private padCols: number;
  private tileCols: number;

  constructor(库: 体素库, 表: 条目表, 输出: string, padCols: number, tileCols: number) {
    this.库 = 库;
    this.表 = 表;
    this.输出 = 输出;
    this.padCols = padCols;
    this.tileCols = tileCols;
    this.levelStats = Array.from({ length: 库.区段.coarsestLevel + 1 }, () => ({ count: 0, bytes: 0, rawBytes: 0, runCount: 0, cellCount: 0 }));
  }

  写一级(level: 层级, ti: number, tj: number) {
    const { sectionCells } = this.库.区段;
    const { paddedSectionCols, encodeSection, sectionInTile } = this.库.区段包;
    const { entryState, entryBiome } = this.表;
    const paletteIdx = this.paletteIdx;
    const cellSize = 2 ** level.L;
    const padAtLevel = this.padCols >> level.L;
    const sectionsPerSide = this.tileCols / (sectionCells * cellSize); // 一块里一边几个区段
    const runCounts = new Uint16Array(paddedSectionCols * paddedSectionCols);
    let runPaletteIdx = new Uint16Array(1 << 16);
    let runLengths = new Uint16Array(1 << 16);
    for (let sj = 0; sj < sectionsPerSide; sj++)
      for (let si = 0; si < sectionsPerSide; si++) {
        const gx0 = padAtLevel + si * sectionCells - 1;
        const gy0 = padAtLevel + sj * sectionCells - 1;
        let hasData = false;
        let minSurface = 无地表;
        let maxTop = 无顶;
        for (let localY = 0; localY < paddedSectionCols; localY++)
          for (let localX = 0; localX < paddedSectionCols; localX++) {
            const levelCol = (gy0 + localY) * level.W + gx0 + localX;
            minSurface = Math.min(minSurface, level.surface[levelCol]!);
            maxTop = Math.max(maxTop, level.tops[levelCol]!);
            if (localX > 0 && localY > 0 && localX <= sectionCells && localY <= sectionCells && level.runStarts[levelCol + 1]! > level.runStarts[levelCol]!) hasData = true;
          }
        if (!hasData) continue;
        const kBottom = Math.max(level.kb, Math.floor((minSurface - 4) / cellSize));
        const kTop = Math.max(kBottom, maxTop);
        const nz = kTop - kBottom + 1;
        const palette: number[] = [0, this.库.区段包.noBiome];
        const usedEntries: number[] = [0];
        paletteIdx[0] = 0;
        let runCount = 0;
        for (let localY = 0; localY < paddedSectionCols; localY++)
          for (let localX = 0; localX < paddedSectionCols; localX++) {
            const levelCol = (gy0 + localY) * level.W + gx0 + localX;
            const r0 = runCount;
            const emitRun = (entry: number, len: number) => {
              let paletteSlot = paletteIdx[entry]!;
              if (paletteSlot < 0) {
                paletteSlot = paletteIdx[entry] = palette.length / 2;
                palette.push(entryState[entry]!, entryBiome[entry]!);
                usedEntries.push(entry);
              }
              if (runCount > r0 && runPaletteIdx[runCount - 1] === paletteSlot) runLengths[runCount - 1]! += len;
              else {
                if (runCount === runPaletteIdx.length) {
                  const x = new Uint16Array(runCount * 2);
                  x.set(runPaletteIdx);
                  runPaletteIdx = x;
                  const y = new Uint16Array(runCount * 2);
                  y.set(runLengths);
                  runLengths = y;
                }
                runPaletteIdx[runCount] = paletteSlot;
                runLengths[runCount++] = len;
              }
            };
            if (level.runStarts[levelCol + 1] === level.runStarts[levelCol]) emitRun(0, nz);
            else {
              let top = level.kt;
              for (let runIdx = level.runStarts[levelCol]!; runIdx < level.runStarts[levelCol + 1]!; runIdx++) {
                const bt = level.bottoms[runIdx]!;
                const hi = Math.min(top, kTop), lo = Math.max(bt, kBottom);
                if (hi >= lo) emitRun(level.entries[runIdx]!, hi - lo + 1);
                top = bt - 1;
                if (top < kBottom) break;
              }
            }
            runCounts[localY * paddedSectionCols + localX] = runCount - r0;
          }
        for (const entry of usedEntries) paletteIdx[entry] = -1;
        const id = { L: level.L, i: ti * sectionsPerSide + si, j: tj * sectionsPerSide + sj };
        const raw = encodeSection({ ...id, kBottom, nz, palette: Uint16Array.from(palette), runCounts, paletteIndex: runPaletteIdx.subarray(0, runCount), runLengths: runLengths.subarray(0, runCount) });
        const gz = gzipSync(raw, { level: 6 });
        this.tileSections.push({ slot: sectionInTile(id).slot, gz });
        const st = this.levelStats[level.L]!;
        st.count++;
        st.bytes += gz.length;
        st.rawBytes += raw.length;
        st.runCount += runCount;
        st.cellCount += paddedSectionCols * paddedSectionCols * nz;
      }
  }

  写块(ti: number, tj: number) {
    const { tileEntryCount, tileHeaderLen, encodeTileHeader, tileFileName } = this.库.区段包;
    const sectionIndex = new Uint32Array(2 * tileEntryCount);
    let offset = tileHeaderLen;
    for (const { slot, gz } of this.tileSections) {
      sectionIndex[2 * slot] = offset;
      sectionIndex[2 * slot + 1] = gz.length;
      offset += gz.length;
    }
    const fd = openSync(path.join(this.输出, tileFileName(ti, tj)), 'w');
    try {
      writeSync(fd, encodeTileHeader(ti, tj, sectionIndex));
      for (const { gz } of this.tileSections) writeSync(fd, gz);
    } finally {
      closeSync(fd);
    }
    this.tileSections = [];
    this.tileFileCount++;
  }
}
