// 一级的列（层级）和往上一级的合并：2×2 列并一列，每格照 Voxy 的 Mipper 从 2×2×2 子格挑代表（合并键 = engine/voxel/生成.ts 的 mergeKey）。
// 照旧项目 工具/导入/烘焙/合并.ts，逐字节一致靠的是挑代表、并段的先后都不变。
// W × W 列，第 c 列的段是 runStarts[c]～runStarts[c+1]，从上往下；第一段的顶是这一级最高一格 kt，往后每段的顶 = 上一段的底 − 1，最后一段的底是 kb。
// 段数 0 = 没有数据。surface：列里（第 0 级的各列里）最低的地表（场景 z）；tops：最高的非空气格的格号。
import type { 条目表 } from './条目.ts';

export const 无地表 = 32767;
export const 无顶 = -32768;

export type 层级 = { L: number; W: number; kb: number; kt: number; runStarts: Uint32Array; entries: Uint16Array; bottoms: Int16Array; surface: Int16Array; tops: Int16Array };

export class 段缓冲 {
  n = 0;
  entries = new Uint16Array(1 << 20);
  bottoms = new Int16Array(1 << 20);
  push(entry: number, bottom: number) {
    if (this.n === this.entries.length) {
      const grownEntries = new Uint16Array(this.n * 2);
      grownEntries.set(this.entries);
      this.entries = grownEntries;
      const grownBottoms = new Int16Array(this.n * 2);
      grownBottoms.set(this.bottoms);
      this.bottoms = grownBottoms;
    }
    this.entries[this.n] = entry;
    this.bottoms[this.n++] = bottom;
  }
}

/** 第 L 级 ← 第 L−1 级；zb、zt 是第 0 级最低、最高一格（场景 z） */
export const 合并一级 = (prev: 层级, 表: 条目表, 合并键: (op: number, L: number, lx: number, ly: number, lz: number, prio: number) => number, zb: number, zt: number): 层级 => {
  const levelNo = prev.L + 1;
  const width = prev.W >> 1;
  const kb = Math.floor(zb / 2 ** levelNo);
  const kt = Math.floor(zt / 2 ** levelNo);
  const runStarts = new Uint32Array(width * width + 1);
  const surfaces = new Int16Array(width * width).fill(无地表);
  const tops = new Int16Array(width * width).fill(无顶);
  const runBuf = new 段缓冲();
  const { entries: pe, bottoms: pb } = prev;
  const { entryAsAir, entryOpaque } = 表;
  const cur = new Int32Array(4);
  const end = new Int32Array(4);
  // 子列 t = b·2 + a：a 是 x 方向（东），b 是场景 y 方向（北）
  for (let gy = 0; gy < width; gy++)
    for (let gx = 0; gx < width; gx++) {
      const levelCol = gy * width + gx;
      let hasData = false;
      let minSurface = 无地表;
      for (let t = 0; t < 4; t++) {
        const ci = (2 * gy + (t >> 1)) * prev.W + 2 * gx + (t & 1);
        cur[t] = prev.runStarts[ci]!;
        end[t] = prev.runStarts[ci + 1]!;
        if (end[t]! > cur[t]!) hasData = true;
        minSurface = Math.min(minSurface, prev.surface[ci]!);
      }
      if (hasData) {
        surfaces[levelCol] = minSurface;
        const s0 = runBuf.n;
        let k = kt;
        while (k >= kb) {
          const hi = 2 * k + 1, lo = 2 * k;
          let wholeRun = true;
          let uniformCells = k - kb + 1; // 往下多少格结果都一样
          for (let t = 0; t < 4; t++) {
            if (cur[t] === end[t]) continue; // 没数据的子列：全是空气
            while (cur[t]! < end[t]! - 1 && pb[cur[t]!]! > hi) cur[t]!++;
            const bt = pb[cur[t]!]!;
            if (bt > hi) continue; // hi 已经在这一列最低一格下面：空气
            if (bt > lo) wholeRun = false; // 这一段到 hi 就完了，lo 在下一段
            else uniformCells = Math.min(uniformCells, k + (-bt >> 1) + 1); // 两个子格都在这一段里的粗格一直到 ⌈bt/2⌉
          }
          let best = 0, bestEntry = 0;
          for (let t = 0; t < 4; t++) {
            if (cur[t] === end[t]) continue;
            const runIdx = cur[t]!;
            if (pb[runIdx]! > hi) continue;
            const subX = t & 1, subY = t >> 1;
            const eh = pe[runIdx]!;
            if (!entryAsAir[eh]) {
              const key = 合并键(entryOpaque[eh]!, 1, subX, subY, 1, 0);
              if (key > best) (best = key), (bestEntry = eh);
            }
            if (wholeRun) continue;
            // 逐格：lo 在 r 或下一段（r 的底是 hi 时）；再往下没有段就是最低一格下面，空气
            const r2 = pb[runIdx]! > lo ? runIdx + 1 : runIdx;
            if (r2 >= end[t]!) continue;
            const el = pe[r2]!;
            if (!entryAsAir[el]) {
              const key = 合并键(entryOpaque[el]!, 1, subX, subY, 0, 0);
              if (key > best) (best = key), (bestEntry = el);
            }
          }
          const stepCells = wholeRun ? uniformCells : 1;
          if (bestEntry && tops[levelCol] === 无顶) tops[levelCol] = k;
          if (runBuf.n > s0 && runBuf.entries[runBuf.n - 1] === bestEntry) runBuf.bottoms[runBuf.n - 1] = k - stepCells + 1;
          else runBuf.push(bestEntry, k - stepCells + 1);
          k -= stepCells;
        }
      }
      runStarts[levelCol + 1] = runBuf.n;
    }
  return { L: levelNo, W: width, kb, kt, runStarts, entries: runBuf.entries.slice(0, runBuf.n), bottoms: runBuf.bottoms.slice(0, runBuf.n), surface: surfaces, tops };
};
