// 第 0 级的地表修正：浮空的东西（云岛、空中史莱姆岛、大悬崖檐）底下和露天连通的空当，地表拉到空当底。照旧项目 工具/导入/烘焙/地表.ts。
// 按「最高整格方块的顶 = 地表」算会把下面的地面丢掉，从侧面看是空的。所以浮空那块下面的空当若横着和露天空当连通，地表就拉到空当底。
// 只顺着 ≥ 长空当 高的空当找，免得顺着洞穴把整片地下都存下来；只在本块（带四周 64 列）里找。
const 长空当 = 16;

export const 浮空下地表 = (width: number, runStarts: Uint32Array, runEntries: Uint16Array, runBottoms: Int16Array, surfaces: Int16Array, entryFullCube: Uint8Array, zb: number, zt: number) => {
  // 每列最高的整格方块下面、≥ 长空当 的空当：[列, 底, 顶]
  const gapCols: number[] = [], gapBottoms: number[] = [], gapTops: number[] = [];
  const gapsByCol = new Map<number, number[]>();
  for (let col = 0; col < width * width; col++) {
    if (runStarts[col + 1] === runStarts[col] || surfaces[col]! <= zb) continue;
    let top = zt;
    let pastFullTop = false; // 过了最高的整格方块
    let gapTop = NaN; // 当前空当的顶
    for (let k = runStarts[col]!; k < runStarts[col + 1]!; k++) {
      const solid = entryFullCube[runEntries[k]!] === 1;
      if (!pastFullTop) {
        if (solid) pastFullTop = true;
      } else if (!solid && Number.isNaN(gapTop)) gapTop = top;
      if (pastFullTop && !Number.isNaN(gapTop) && (solid || k === runStarts[col + 1]! - 1)) {
        const lo = solid ? top + 1 : runBottoms[k]!;
        if (gapTop - lo + 1 >= 长空当) {
          let colGaps = gapsByCol.get(col);
          if (!colGaps) gapsByCol.set(col, (colGaps = []));
          colGaps.push(gapCols.length);
          gapCols.push(col);
          gapBottoms.push(lo);
          gapTops.push(gapTop);
        }
        gapTop = NaN;
      }
      top = runBottoms[k]! - 1;
    }
  }
  if (!gapCols.length) return;
  // 从露天的空当（每列最高整格方块上面那一段，[地表, zt]）横着往里找：先挑挨着露天空当的，再顺着彼此挨着的找
  const connected = new Uint8Array(gapCols.length);
  const queue: number[] = [];
  const neighbors = (c: number) => [c % width > 0 ? c - 1 : -1, c % width < width - 1 ? c + 1 : -1, c >= width ? c - width : -1, c < width * width - width ? c + width : -1];
  for (let gapIdx = 0; gapIdx < gapCols.length; gapIdx++)
    if (neighbors(gapCols[gapIdx]!).some((n) => n >= 0 && runStarts[n + 1]! > runStarts[n]! && surfaces[n]! <= gapTops[gapIdx]!)) {
      connected[gapIdx] = 1;
      queue.push(gapIdx);
    }
  while (queue.length) {
    const gapIdx = queue.pop()!;
    for (const neighbor of neighbors(gapCols[gapIdx]!)) {
      for (const r2 of neighbor >= 0 ? (gapsByCol.get(neighbor) ?? []) : []) {
        if (connected[r2] || gapBottoms[r2]! > gapTops[gapIdx]! || gapBottoms[gapIdx]! > gapTops[r2]!) continue;
        connected[r2] = 1;
        queue.push(r2);
      }
    }
  }
  for (let gapIdx = 0; gapIdx < gapCols.length; gapIdx++) if (connected[gapIdx]) surfaces[gapCols[gapIdx]!] = Math.min(surfaces[gapCols[gapIdx]!]!, gapBottoms[gapIdx]!);
};
