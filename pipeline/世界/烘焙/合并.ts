// 一级的列（层级）和往上一级的合并：2×2 列并一列，每格照 Voxy 的 Mipper 从 2×2×2 子格挑代表（合并键 = engine/voxel/生成.ts 的 mergeKey）。
// 照旧项目 工具/导入/烘焙/合并.ts，逐字节一致靠的是挑代表、并段的先后都不变。
// W × W 列，第 c 列的段是 runStarts[c]～runStarts[c+1]，从上往下；第一段的顶是这一级最高一格 kt，往后每段的顶 = 上一段的底 − 1，最后一段的底是 kb。
// 段数 0 = 没有数据。surface：列里（第 0 级的各列里）最低的地表（场景 z）；tops：最高的非空气格的格号。
import type { EntryTable } from './条目.ts';

export const noSurface = 32767;
export const noTop = -32768;

export type Level = { L: number; W: number; kb: number; kt: number; runStarts: Uint32Array; entries: Uint16Array; bottoms: Int16Array; surface: Int16Array; tops: Int16Array };

export class SegmentBuffer {
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

// 发光优先（世界声明 [bake] glowFirst，用户 11-16 要远处的火、熔岩也亮）：发光方块（engine/voxel/方块发光.ts）露在外面的，合并时比谁都优先（不透明度当 16），
// 不然墙上一格熔岩、地上的火、挂在顶上的萤石在粗级里全被地狱岩盖掉。「露在外面」按段算：这一段里有一格的六个邻格之一是空气、或者不是整格也不发光的方块（花草），
// 整段都算（熔岩海从海面到底是一段，海面露着，海底也算，被上面的熔岩挡着看不见）。封在岩壁里的一格熔岩（原版的封闭泉）六面都是整格，不算，否则远处岩壁上会冒出一片熔岩点。
const glowOpaque = 16;
/** 上一级每一段算不算露在外面的发光方块（1 = 是） */
const exposedGlowRuns = (prev: Level, entryTable: EntryTable): Uint8Array => {
  const { entries: pe, bottoms: pb, runStarts, W, kt } = prev;
  const { entryGlow, entryAsAir, entryFullCube } = entryTable;
  const out = new Uint8Array(pe.length);
  const opens = (e: number) => entryAsAir[e] === 1 || (!entryFullCube[e] && !entryGlow[e]);
  // 第 c 列第 k 格的条目（列外、没数据的列当不露：包边上不知道外面是什么，按岩壁算）
  const entryAt = (c: number, k: number, hint: { r: number }) => {
    const end = runStarts[c + 1]!;
    let r = Math.max(hint.r, runStarts[c]!);
    if (r >= end) return -1;
    if (k > kt) return 0;
    while (r < end - 1 && pb[r]! > k) r++;
    hint.r = r;
    return pb[r]! > k ? -1 : pe[r]!;
  };
  for (let c = 0; c < W * W; c++) {
    const x = c % W, y = (c - x) / W;
    const r0 = runStarts[c]!, r1 = runStarts[c + 1]!;
    const neighbors = [x + 1 < W ? c + 1 : -1, x > 0 ? c - 1 : -1, y + 1 < W ? c + W : -1, y > 0 ? c - W : -1];
    const hints = neighbors.map((n) => ({ r: n < 0 ? 0 : runStarts[n]! }));
    for (let r = r0; r < r1; r++) {
      if (!entryGlow[pe[r]!]) continue;
      const top = r === r0 ? kt : pb[r - 1]! - 1;
      const bottom = pb[r]!;
      let exposed = r === r0 || opens(pe[r - 1]!) || (r + 1 < r1 && opens(pe[r + 1]!));
      for (let k = top; !exposed && k >= bottom; k--)
        for (let t = 0; t < 4; t++) {
          const n = neighbors[t]!;
          if (n < 0) continue;
          const e = entryAt(n, k, hints[t]!);
          if (e >= 0 && opens(e)) {
            exposed = true;
            break;
          }
        }
      if (exposed) out[r] = 1;
    }
  }
  return out;
};

/** 第 L 级 ← 第 L−1 级；zb、zt 是第 0 级最低、最高一格（场景 z）；发光优先 见上 */
export const mergeLevel = (prev: Level, entryTable: EntryTable, mergeKey: (op: number, L: number, lx: number, ly: number, lz: number, prio: number) => number, zb: number, zt: number, glowFirst = false): Level => {
  const levelNo = prev.L + 1;
  const width = prev.W >> 1;
  const kb = Math.floor(zb / 2 ** levelNo);
  const kt = Math.floor(zt / 2 ** levelNo);
  const runStarts = new Uint32Array(width * width + 1);
  const surfaces = new Int16Array(width * width).fill(noSurface);
  const tops = new Int16Array(width * width).fill(noTop);
  const runBuf = new SegmentBuffer();
  const { entries: pe, bottoms: pb } = prev;
  const { entryAsAir, entryOpaque } = entryTable;
  const glowRuns = glowFirst ? exposedGlowRuns(prev, entryTable) : null;
  const cur = new Int32Array(4);
  const end = new Int32Array(4);
  // 子列 t = b·2 + a：a 是 x 方向（东），b 是场景 y 方向（北）
  for (let gy = 0; gy < width; gy++)
    for (let gx = 0; gx < width; gx++) {
      const levelCol = gy * width + gx;
      let hasData = false;
      let minSurface = noSurface;
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
              const key = mergeKey(glowRuns?.[runIdx] ? glowOpaque : entryOpaque[eh]!, 1, subX, subY, 1, 0);
              if (key > best) (best = key), (bestEntry = eh);
            }
            if (wholeRun) continue;
            // 逐格：lo 在 r 或下一段（r 的底是 hi 时）；再往下没有段就是最低一格下面，空气
            const r2 = pb[runIdx]! > lo ? runIdx + 1 : runIdx;
            if (r2 >= end[t]!) continue;
            const el = pe[r2]!;
            if (!entryAsAir[el]) {
              const key = mergeKey(glowRuns?.[r2] ? glowOpaque : entryOpaque[el]!, 1, subX, subY, 0, 0);
              if (key > best) (best = key), (bestEntry = el);
            }
          }
          const stepCells = wholeRun ? uniformCells : 1;
          if (bestEntry && tops[levelCol] === noTop) tops[levelCol] = k;
          if (runBuf.n > s0 && runBuf.entries[runBuf.n - 1] === bestEntry) runBuf.bottoms[runBuf.n - 1] = k - stepCells + 1;
          else runBuf.push(bestEntry, k - stepCells + 1);
          k -= stepCells;
        }
      }
      runStarts[levelCol + 1] = runBuf.n;
    }
  return { L: levelNo, W: width, kb, kt, runStarts, entries: runBuf.entries.slice(0, runBuf.n), bottoms: runBuf.bottoms.slice(0, runBuf.n), surface: surfaces, tops };
};
