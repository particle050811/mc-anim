// 格式 3 的逐格预测模型；状态类、条件字面值先验见 docs/决策/0011-地形压缩.md。
import type { VoxelLib } from '../体素库.ts';
import type { SectionModel } from '../../../engine/voxel/区段模型.ts';
import type { SectionData } from '../../../engine/voxel/区段包.ts';
import { paddedSectionCols } from '../../../engine/voxel/区段.ts';
/** 区段每边几列：按 runCounts 的长度算（格式 4 是 66；转码读格式 3 时是 34，编码规则一样，只差列数） */
export const sideOf = (d: Pick<SectionData, 'runCounts'>) => {
  const side = Math.round(Math.sqrt(d.runCounts.length));
  if (side * side !== d.runCounts.length) throw new Error(`区段的列数 ${d.runCounts.length} 不是平方数`);
  return side;
};
// 模型表的布局（u16 下标）：p1、p2、p3 各 128 × 3 级，跳 64 × 3 级，整列 9 × 3 级
export const tableLayout = { p1: 0, p2: 384, p3: 768, 跳: 1152, 列: 1344, 总: 1371 } as const;
export const levelOf = (L: number) => (L === 0 ? 0 : L <= 2 ? 1 : 2);

export interface BitSink {
  literal?(u: number, v: number): void;
  /** 概率数组 ps 第 i 项上记一位，返回这一位 */
  bit(ps: Uint16Array, i: number, b: number, state?: number): number;
}

export class RangeEncoder implements BitSink {
  private low = 0;
  private range = 0xffffffff;
  private cache = 0;
  private cacheSize = 1;
  private out: Uint8Array;
  private n = 0;
  constructor(capacityHint: number) {
    this.out = new Uint8Array(capacityHint);
  }
  private writeByte(b: number) {
    if (this.n === this.out.length) {
      const x = new Uint8Array(this.n * 2);
      x.set(this.out);
      this.out = x;
    }
    this.out[this.n++] = b;
  }
  private shift() {
    if (this.low < 0xff000000 || this.low >= 0x100000000) {
      const carry = this.low >= 0x100000000 ? 1 : 0;
      let t = this.cache;
      do {
        this.writeByte((t + carry) & 255);
        t = 255;
      } while (--this.cacheSize);
      this.cache = Math.floor(this.low / 0x1000000) & 255;
    }
    this.cacheSize++;
    this.low = (this.low % 0x1000000) * 256;
  }
  bit(ps: Uint16Array, i: number, b: number, shift = 4) {
    const p = ps[i]!, bound = (this.range >>> 11) * p;
    if (!b) {
      this.range = bound;
      ps[i] = p + ((2048 - p) >> shift);
    } else {
      this.low += bound;
      this.range -= bound;
      ps[i] = p - (p >> shift);
    }
    while (this.range < 0x1000000) {
      this.range *= 256;
      this.shift();
    }
    return b;
  }
  /** 第一个输出字节恒为 0，不存；解码器正好读完剩下的字节（解码器靠这一点查坏数据） */
  finish() {
    for (let i = 0; i < 5; i++) this.shift();
    return this.out.subarray(1, this.n);
  }
}

/** SectionData → 列优先的格子 cm[c·nz + k]，k 从下往上 */
export const toColumnMajor = (d: Pick<SectionData, 'nz' | 'runCounts' | 'paletteIndex' | 'runLengths'>) => {
  const nz = d.nz, columnCount = d.runCounts.length, cm = new Uint16Array(columnCount * nz);
  let r = 0;
  for (let c = 0; c < columnCount; c++) {
    let z = nz;
    for (const end = r + d.runCounts[c]!; r < end; r++) {
      const p = d.paletteIndex[r]!, z0 = z - d.runLengths[r]!;
      if (p) cm.fill(p, c * nz + z0, c * nz + z);
      z = z0;
    }
  }
  return cm;
};

/** 列优先的格子 → SectionData：色板照 写区段.ts 按出现先后重排（列从小到大、列内从上往下），没用到的丢掉，空气固定第 0 项。
 *  色板 是 (状态号, 群系号) 交替的数组；烘出来的区段本来就是这个顺序，所以没改的格子原样回来 */
export const fromColumnMajor = (id: { L: number; i: number; j: number }, kBottom: number, nz: number, cm: Uint16Array, palette: ArrayLike<number>, columnCount: number): SectionData => {
  const newIds = new Int32Array(palette.length / 2).fill(-1), out = [palette[0]!, palette[1]!];
  newIds[0] = 0;
  const runCounts = new Uint16Array(columnCount), runIds: number[] = [], runLengths: number[] = [];
  for (let c = 0; c < columnCount; c++) {
    const r0 = runIds.length;
    for (let k = nz - 1; k >= 0; k--) {
      const p = cm[c * nz + k]!;
      let q = newIds[p]!;
      if (q < 0) { q = newIds[p] = out.length / 2; out.push(palette[2 * p]!, palette[2 * p + 1]!); }
      if (runIds.length > r0 && runIds[runIds.length - 1] === q) runLengths[runLengths.length - 1]!++;
      else { runIds.push(q); runLengths.push(1); }
    }
    runCounts[c] = runIds.length - r0;
  }
  return { L: id.L, i: id.i, j: id.j, kBottom, nz, palette: Uint16Array.from(out), runCounts, paletteIndex: Uint16Array.from(runIds), runLengths: Uint16Array.from(runLengths) };
};

let runLengths = new Uint16Array(1 << 20);

/** 边：区段每边几列（解码器 wasm/区段解码.ts 写死 66，34 只给测试、转码核对旧格式用） */
export const walkModel = (rc: BitSink, cm: Uint16Array, nz: number, paletteSize: number, L: number, codeTable: Uint16Array, palette: Uint16Array, sectionSide = paddedSectionCols) => {
  const columnCount = sectionSide * sectionSide;
  let bits = 1;
  while (1 << bits < paletteSize) bits++;
  const probTree = new Uint16Array(1 << bits).fill(1024), l = levelOf(L), ctxOffset = l * 128;
  const { p1: o1, p2: o2, p3: o3, 跳: jumpOffset, 列: colOffset } = tableLayout;
  if (runLengths.length < columnCount * nz) runLengths = new Uint16Array(columnCount * nz);
  const runBuf = runLengths;
  let lastMiss = 0, prevCol = 2;
  const sameColumn = (a: number, b: number) => {
    for (let k = 0; k < nz; k++) if (cm[a + k] !== cm[b + k]) return 0;
    return 1;
  };
  for (let c = 0; c < columnCount; c++) {
    const base = c * nz, hasWest = c % sectionSide > 0, hasNorth = c >= sectionSide;
    const bW = hasWest ? base - nz : hasNorth ? base - sectionSide * nz : -1, bN = hasNorth ? base - sectionSide * nz : bW;
    let isWhole = false, srcBlock = 0;
    if (bW >= 0) {
      const ctx = prevCol + 3 * l;
      if (!rc.bit(codeTable, colOffset + ctx, sameColumn(base, bW) ? 0 : 1)) {
        srcBlock = bW;
        isWhole = true;
        prevCol = 0;
      } else if (bN !== bW) {
        if (!rc.bit(codeTable, colOffset + ctx + 9, sameColumn(base, bN) ? 0 : 1)) {
          srcBlock = bN;
          isWhole = true;
          prevCol = 1;
        }
      }
      if (!isWhole) prevCol = 2;
    }
    if (isWhole) {
      runBuf.copyWithin(base, srcBlock, srcBlock + nz);
      continue;
    }
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
          for (let j = 0; j < m; j++) {
            if (cm[base + k - j] !== U) {
              allSame = 0;
              break;
            }
          }
          const bucket = 31 - Math.clz32(m), ctx = (bucket > 7 ? 7 : bucket) | (U === 0 ? 8 : 0) | (lastMiss << 4) | (isTop ? 32 : 0);
          if (!rc.bit(codeTable, jumpOffset + ctx + 64 * l, allSame ? 0 : 1, palette[2 * U]!)) {
            k -= m;
            lastMiss = 0;
            continue;
          }
          limit = k - m + 1;
        }
      }
      const westChanged = !isTop && bW >= 0 && cm[bW + k] !== cm[bW + k + 1] ? 1 : 0;
      const northChanged = !isTop && bN >= 0 && cm[bN + k] !== cm[bN + k + 1] ? 1 : 0;
      const ctx = ctxOffset + (westChanged | (northChanged << 1) | (W === U ? 4 : 0) | (N === U ? 8 : 0) | (W === N ? 16 : 0) | (lastMiss << 5) | (U === 0 ? 64 : 0));
      const v = cm[base + k]!;
      if (!rc.bit(codeTable, o1 + ctx, v === U ? 0 : 1, palette[2 * U]!)) {
        lastMiss = 0;
        k--;
        continue;
      }
      lastMiss = 1;
      if (W !== U && !rc.bit(codeTable, o2 + ctx, v === W ? 0 : 1, palette[2 * W]!)) {
        k--;
        continue;
      }
      if (N !== U && N !== W && !rc.bit(codeTable, o3 + ctx, v === N ? 0 : 1, palette[2 * N]!)) {
        k--;
        continue;
      }
      rc.literal?.(U, v);
      let n = 1;
      for (let i = bits - 1; i >= 0; i--) n = (n << 1) | rc.bit(probTree, n, (v >> i) & 1, U);
      k--;
    }
    if (nz) runBuf[base] = 1;
    for (let z = 1; z < nz; z++) runBuf[base + z] = cm[base + z] === cm[base + z - 1] ? runBuf[base + z - 1]! + 1 : 1;
  }
};


/** 同一模型和格子生成相同的字节；区段之间不共享自适应状态，支持独立 Range 解码。 */
export const encodeSection = (d: SectionData, sectionModel: SectionModel, cm: Uint16Array = toColumnMajor(d)): Uint8Array => {
  const P = d.palette.length / 2;
  if (d.nz > 0xffff || P < 1 || P > 0xffff || d.kBottom < -0x8000 || d.kBottom > 0x7fff) throw new Error(`区段放不进格式：nz ${d.nz}、色板 ${P} 项、kBottom ${d.kBottom}`);
  const ps = new Uint16Array(1371), probs = sectionModel.init.slice();
  const { tree, n } = initTree(d.palette, sectionModel), rc = new RangeEncoder(4096);
  walkModel({ bit(p, i, b, s = 0) {
    const lit = p !== ps;
    const idx = lit ? sectionModel.map[d.palette[2 * s]!]! * n + i : (i < 1344 ? sectionModel.map[s]! * 1371 : 0) + i;
    return rc.bit(lit ? tree : probs, idx, b, lit ? 4 : 5);
  } }, cm, d.nz, P, d.L, ps, d.palette, sideOf(d));
  const encoded = rc.finish(), out = new Uint8Array(6 + d.palette.byteLength + encoded.length), dv = new DataView(out.buffer);
  dv.setUint16(0, d.nz, true); dv.setInt16(2, d.kBottom, true); dv.setUint16(4, P, true);
  out.set(new Uint8Array(d.palette.buffer, d.palette.byteOffset, d.palette.byteLength), 6);
  out.set(encoded, 6 + d.palette.byteLength);
  return out;
};

export const encodeVerified = (voxelLib: VoxelLib, d: SectionData, sectionModel: SectionModel): Uint8Array => {
  const cm = toColumnMajor(d), packed = encodeSection(d, sectionModel, cm), decoded = voxelLib.sectionDecoder.decodeSection(packed, d, sectionModel);
  const arraysEqual = (a: Uint16Array, b: Uint16Array) => a.length === b.length && Buffer.compare(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength)) === 0;
  if (decoded.kBottom !== d.kBottom || decoded.nz !== d.nz || !arraysEqual(decoded.palette, d.palette) || !arraysEqual(toColumnMajor(decoded), cm)) throw new Error(`区段 ${d.L}/${d.i}/${d.j} 压完解回来不一样`);
  return packed;
};

const initTree = (palette: Uint16Array, m: SectionModel) => {
  const P = palette.length / 2, n = 1 << Math.max(1, Math.ceil(Math.log2(P)));
  const tree = new Uint16Array(m.classes * n), scratch = new Float64Array(n * 2);
  for (let c = 0; c < m.classes; c++) {
    scratch.fill(0);
    for (let v = 0; v < P; v++) { const s = palette[2 * v]!; scratch[n + v] = s < m.stride ? m.weights[c * m.stride + s]! : 1; }
    for (let i = n - 1; i > 0; i--) {
      const a = scratch[2 * i]!, b = scratch[2 * i + 1]!;
      scratch[i] = a + b;
      tree[c * n + i] = a + b ? Math.max(15, Math.min(2033, Math.round(a / (a + b) * 2048))) : 1024;
    }
  }
  return { tree, n };
};
