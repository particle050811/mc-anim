// 把一级的列切成区段、换成区段自己的色板、压缩（区段编码.ts），攒齐一块的各级后写成块文件（格式见 engine/voxel/区段包.ts）。照旧项目 工具/导入/烘焙/写区段.ts。
import { closeSync, openSync, writeSync } from 'node:fs';
import path from 'node:path';
import { defaultModel } from '../../../engine/voxel/区段模型.ts';
const neutralModel = defaultModel();
import type { VoxelLib } from '../体素库.ts';
import { noSurface, noTop, type Level } from './合并.ts';
import { encodeVerified } from './区段编码.ts';
import { entryLimit, type EntryTable } from './条目.ts';

export type LevelStats = { count: number; bytes: number; rawBytes: number; runCount: number; cellCount: number };

export class SectionWriter {
  levelStats: LevelStats[];
  tileFileCount = 0;
  private paletteIdx = new Int32Array(entryLimit).fill(-1);
  private tileSections: { slot: number; packed: Uint8Array }[] = [];

  private lib: VoxelLib;
  private 表: EntryTable;
  private output: string;
  private padCols: number;
  private tileCols: number;

  constructor(voxelLib: VoxelLib, entryTable: EntryTable, output: string, padCols: number, tileCols: number) {
    this.lib = voxelLib;
    this.表 = entryTable;
    this.output = output;
    this.padCols = padCols;
    this.tileCols = tileCols;
    this.levelStats = Array.from({ length: voxelLib.sections.coarsestLevel + 1 }, () => ({ count: 0, bytes: 0, rawBytes: 0, runCount: 0, cellCount: 0 }));
  }

  writeLevel(level: Level, ti: number, tj: number) {
    const { sectionCells } = this.lib.sections;
    const { paddedSectionCols, sectionInTile } = this.lib.sectionPack;
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
        let minSurface = noSurface;
        let maxTop = noTop;
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
        const palette: number[] = [0, this.lib.sectionPack.noBiome];
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
        const packed = encodeVerified(this.lib, { ...id, kBottom, nz, palette: Uint16Array.from(palette), runCounts, paletteIndex: runPaletteIdx.subarray(0, runCount), runLengths: runLengths.subarray(0, runCount) }, neutralModel);
        this.tileSections.push({ slot: sectionInTile(id).slot, packed });
        const st = this.levelStats[level.L]!;
        st.count++;
        st.bytes += packed.length;
        st.rawBytes += 36 + (palette.length + paddedSectionCols * paddedSectionCols + 2 * runCount) * 2; // 不压缩时的大小
        st.runCount += runCount;
        st.cellCount += paddedSectionCols * paddedSectionCols * nz;
      }
  }

  writeBlock(ti: number, tj: number) {
    const { tileEntryCount, tileHeaderLen, encodeTileHeader, tileFileName } = this.lib.sectionPack;
    const sectionIndex = new Uint32Array(2 * tileEntryCount);
    let offset = tileHeaderLen;
    for (const { slot, packed } of this.tileSections) {
      sectionIndex[2 * slot] = offset;
      sectionIndex[2 * slot + 1] = packed.length;
      offset += packed.length;
    }
    const fd = openSync(path.join(this.output, tileFileName(ti, tj)), 'w');
    try {
      writeSync(fd, encodeTileHeader(ti, tj, sectionIndex));
      for (const { packed } of this.tileSections) writeSync(fd, packed);
    } finally {
      closeSync(fd);
    }
    this.tileSections = [];
    this.tileFileCount++;
  }
}
