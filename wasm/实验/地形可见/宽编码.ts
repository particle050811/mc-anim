// 每边列数做成参数的区段编码器（照 pipeline/世界/烘焙/区段编码.ts 的 走模型、压区段 抄一份），和把 2×2 个区段拼成 66×66 列的窗口。
// 只给 64×64 的实验用（拼大.ts 量体积、解宽.ts 量解码）；34 列时和正式编码器逐字节相同，拼大.ts 每组先核一遍。
import { RangeEncoder, tableLayout, levelOf as modelLevel, type BitSink } from '../../../pipeline/世界/烘焙/区段编码.ts';
import type { SectionModel } from '../../../engine/voxel/区段模型.ts';
import { sectionSide, type CellGrid } from './公共.ts';

const walkModelWidth = (rc: BitSink, cm: Uint16Array, nz: number, paletteSize: number, L: number, codeTable: Uint16Array, palette: Uint16Array, width: number) => {
  const columnCount = width * width;
  let bits = 1;
  while (1 << bits < paletteSize) bits++;
  const probTree = new Uint16Array(1 << bits).fill(1024), l = modelLevel(L), ctxOffset = l * 128;
  const { p1: o1, p2: o2, p3: o3, 跳: jumpOffset, 列: colOffset } = tableLayout;
  const runBuf = new Uint16Array(columnCount * nz);
  let lastMiss = 0, prevCol = 2;
  const sameColumn = (a: number, b: number) => { for (let k = 0; k < nz; k++) if (cm[a + k] !== cm[b + k]) return 0; return 1; };
  for (let c = 0; c < columnCount; c++) {
    const base = c * nz, hasWest = c % width > 0, hasNorth = c >= width;
    const bW = hasWest ? base - nz : hasNorth ? base - width * nz : -1, bN = hasNorth ? base - width * nz : bW;
    let isWhole = false, srcBlock = 0;
    if (bW >= 0) {
      const ctx = prevCol + 3 * l;
      if (!rc.bit(codeTable, colOffset + ctx, sameColumn(base, bW) ? 0 : 1)) { srcBlock = bW; isWhole = true; prevCol = 0; }
      else if (bN !== bW && !rc.bit(codeTable, colOffset + ctx + 9, sameColumn(base, bN) ? 0 : 1)) { srcBlock = bN; isWhole = true; prevCol = 1; }
      if (!isWhole) prevCol = 2;
    }
    if (isWhole) { runBuf.copyWithin(base, srcBlock, srcBlock + nz); continue; }
    let k = nz - 1, limit = nz;
    while (k >= 0) {
      const isTop = k === nz - 1;
      const W = bW >= 0 ? cm[bW + k]! : 0, N = bN >= 0 ? cm[bN + k]! : 0;
      const U = isTop ? W : cm[base + k + 1]!;
      if (k < limit && U === W && U === N) {
        const mW = bW >= 0 ? runBuf[bW + k]! : k + 1, mN = bN >= 0 ? runBuf[bN + k]! : k + 1;
        const m = mW < mN ? mW : mN;
        if (m >= 2) {
          let allSame = 1;
          for (let j = 0; j < m; j++) if (cm[base + k - j] !== U) { allSame = 0; break; }
          const bucket = 31 - Math.clz32(m), ctx = (bucket > 7 ? 7 : bucket) | (U === 0 ? 8 : 0) | (lastMiss << 4) | (isTop ? 32 : 0);
          if (!rc.bit(codeTable, jumpOffset + ctx + 64 * l, allSame ? 0 : 1, palette[2 * U]!)) { k -= m; lastMiss = 0; continue; }
          limit = k - m + 1;
        }
      }
      const westChanged = !isTop && bW >= 0 && cm[bW + k] !== cm[bW + k + 1] ? 1 : 0;
      const northChanged = !isTop && bN >= 0 && cm[bN + k] !== cm[bN + k + 1] ? 1 : 0;
      const ctx = ctxOffset + (westChanged | (northChanged << 1) | (W === U ? 4 : 0) | (N === U ? 8 : 0) | (W === N ? 16 : 0) | (lastMiss << 5) | (U === 0 ? 64 : 0));
      const v = cm[base + k]!;
      if (!rc.bit(codeTable, o1 + ctx, v === U ? 0 : 1, palette[2 * U]!)) { lastMiss = 0; k--; continue; }
      lastMiss = 1;
      if (W !== U && !rc.bit(codeTable, o2 + ctx, v === W ? 0 : 1, palette[2 * W]!)) { k--; continue; }
      if (N !== U && N !== W && !rc.bit(codeTable, o3 + ctx, v === N ? 0 : 1, palette[2 * N]!)) { k--; continue; }
      let n = 1;
      for (let i = bits - 1; i >= 0; i--) n = (n << 1) | rc.bit(probTree, n, (v >> i) & 1, U);
      k--;
    }
    if (nz) runBuf[base] = 1;
    for (let z = 1; z < nz; z++) runBuf[base + z] = cm[base + z] === cm[base + z - 1] ? runBuf[base + z - 1]! + 1 : 1;
  }
};
const initTree = (palette: Uint16Array, m: SectionModel) => {
  const P = palette.length / 2, n = 1 << Math.max(1, Math.ceil(Math.log2(P)));
  const tree = new Uint16Array(m.classes * n), scratch = new Float64Array(n * 2);
  for (let c = 0; c < m.classes; c++) {
    scratch.fill(0);
    for (let v = 0; v < P; v++) { const s = palette[2 * v]!; scratch[n + v] = s < m.stride ? m.weights[c * m.stride + s]! : 1; }
    for (let i = n - 1; i > 0; i--) { const a = scratch[2 * i]!, b = scratch[2 * i + 1]!; scratch[i] = a + b; tree[c * n + i] = a + b ? Math.max(15, Math.min(2033, Math.round(a / (a + b) * 2048))) : 1024; }
  }
  return { tree, n };
};
/** 格子（色板已按出现先后排好）→ 一个区段的字节，头和色板同格式 3（nz、k底、色板项数、色板），后面是编码流 */
export const compressWidth = (g: CellGrid, L: number, sectionModel: SectionModel): Uint8Array => {
  const width = g.宽 ?? sectionSide, palette = Uint16Array.from(g.palette), P = palette.length / 2;
  const ps = new Uint16Array(1371), probs = sectionModel.init.slice(), { tree, n } = initTree(palette, sectionModel), rc = new RangeEncoder(4096);
  walkModelWidth({ bit(p, i, b, s = 0) {
    const lit = p !== ps;
    const idx = lit ? sectionModel.map[palette[2 * s]!]! * n + i : (i < 1344 ? sectionModel.map[s]! * 1371 : 0) + i;
    return rc.bit(lit ? tree : probs, idx, b, lit ? 4 : 5);
  } }, g.cm, g.nz, P, L, ps, palette, width);
  const encoded = rc.finish(), out = new Uint8Array(6 + palette.byteLength + encoded.length), dv = new DataView(out.buffer);
  dv.setUint16(0, g.nz, true); dv.setInt16(2, g.kBottom, true); dv.setUint16(4, P, true);
  out.set(new Uint8Array(palette.buffer), 6);
  out.set(encoded, 6 + palette.byteLength);
  return out;
};
/** 色板按出现先后重排（列从小到大、列内从上往下）、丢掉没用到的，同 公共.ts 的 成区段 */
export const arrangePalette = (g: CellGrid): CellGrid => {
  const width = g.宽 ?? sectionSide, { nz, cm } = g, newIds = new Int32Array(g.palette.length / 2).fill(-1), palette = [g.palette[0]!, g.palette[1]!], colorIndex = new Uint16Array(cm.length);
  newIds[0] = 0;
  for (let c = 0; c < width * width; c++) for (let k = nz - 1; k >= 0; k--) {
    const p = cm[c * nz + k]!;
    let q = newIds[p]!;
    if (q < 0) { q = newIds[p] = palette.length / 2; palette.push(g.palette[2 * p]!, g.palette[2 * p + 1]!); }
    colorIndex[c * nz + k] = q;
  }
  return { ...g, cm: colorIndex, palette };
};

export const bigCount = 2 * sectionSide - 2;
/** 四个区段 [西南, 东南, 西北, 东北]（i、j 小的在前）拼成 66×66 */
export const combineQuad = (quad: CellGrid[], stoneState: number, stateFull: Uint8Array): CellGrid => {
  const kb = Math.min(...quad.map((g) => g.kBottom)), nz = Math.max(...quad.map((g) => g.kBottom + g.nz)) - kb;
  const palette = [quad[0]!.palette[0]!, quad[0]!.palette[1]!, stoneState, 65535], indexByKey = new Map<number, number>([[palette[0]! * 65536 + palette[1]!, 0], [stoneState * 65536 + 65535, 1]]);
  const remap = quad.map((g) => Uint16Array.from({ length: g.palette.length / 2 }, (_, p) => {
    const key = g.palette[2 * p]! * 65536 + g.palette[2 * p + 1]!;
    let q = indexByKey.get(key);
    if (q === undefined) { q = palette.length / 2; indexByKey.set(key, q); palette.push(g.palette[2 * p]!, g.palette[2 * p + 1]!); }
    return q;
  }));
  const cm = new Uint16Array(bigCount * bigCount * nz);
  for (let Y = 0; Y < bigCount; Y++) for (let X = 0; X < bigCount; X++) {
    const eastBit = X > 32 ? 1 : 0, northBit = Y > 32 ? 1 : 0, quadrant = northBit * 2 + eastBit, g = quad[quadrant]!, m = remap[quadrant]!;
    const srcOffset = ((Y - 32 * northBit) * sectionSide + X - 32 * eastBit) * g.nz, dst = (Y * bigCount + X) * nz, padCells = g.kBottom - kb;
    cm.fill(1, dst, dst + padCells);
    for (let k = 0; k < g.nz; k++) cm[dst + padCells + k] = m[g.cm[srcOffset + k]!]!;
  }
  const full = new Uint8Array(palette.length / 2);
  for (let p = 1; p < full.length; p++) full[p] = stateFull[palette[2 * p]!]!;
  return { id: { L: quad[0]!.id.L, i: quad[0]!.id.i >> 1, j: quad[0]!.id.j >> 1 }, kBottom: kb, nz, cm, palette, fullMask: full, stone: 1, 宽: bigCount };
};
