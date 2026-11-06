// 格式 3 的逐格预测模型；状态类、条件字面值先验见 docs/决策/0011-地形压缩.md。
import type { 体素库 } from '../体素库.ts';
import type { 区段模型 } from '../../../engine/voxel/区段模型.ts';
import type { SectionData } from '../../../engine/voxel/区段包.ts';
const 边 = 34, 列数 = 边 * 边;
// 模型表的布局（u16 下标）：p1、p2、p3 各 128 × 3 级，跳 64 × 3 级，整列 9 × 3 级
export const 表布局 = { p1: 0, p2: 384, p3: 768, 跳: 1152, 列: 1344, 总: 1371 } as const;
export const 级 = (L: number) => (L === 0 ? 0 : L <= 2 ? 1 : 2);

export interface 记号器 {
  literal?(u: number, v: number): void;
  /** 概率数组 ps 第 i 项上记一位，返回这一位 */
  bit(ps: Uint16Array, i: number, b: number, state?: number): number;
}

export class 区间编码器 implements 记号器 {
  private low = 0;
  private range = 0xffffffff;
  private cache = 0;
  private cacheSize = 1;
  private out: Uint8Array;
  private n = 0;
  constructor(预估: number) {
    this.out = new Uint8Array(预估);
  }
  private 写(b: number) {
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
        this.写((t + carry) & 255);
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
  完() {
    for (let i = 0; i < 5; i++) this.shift();
    return this.out.subarray(1, this.n);
  }
}

/** SectionData → 列优先的格子 cm[c·nz + k]，k 从下往上 */
export const 到列优先 = (d: Pick<SectionData, 'nz' | 'runCounts' | 'paletteIndex' | 'runLengths'>) => {
  const nz = d.nz, cm = new Uint16Array(列数 * nz);
  let r = 0;
  for (let c = 0; c < 列数; c++) {
    let z = nz;
    for (const end = r + d.runCounts[c]!; r < end; r++) {
      const p = d.paletteIndex[r]!, z0 = z - d.runLengths[r]!;
      if (p) cm.fill(p, c * nz + z0, c * nz + z);
      z = z0;
    }
  }
  return cm;
};

let 跑长 = new Uint16Array(1 << 20);

export const 走模型 = (rc: 记号器, cm: Uint16Array, nz: number, 色板项: number, L: number, 表: Uint16Array, palette: Uint16Array) => {
  let 位 = 1;
  while (1 << 位 < 色板项) 位++;
  const 树 = new Uint16Array(1 << 位).fill(1024), l = 级(L), 偏 = l * 128;
  const { p1: o1, p2: o2, p3: o3, 跳: o跳, 列: o列 } = 表布局;
  if (跑长.length < 列数 * nz) 跑长 = new Uint16Array(列数 * nz);
  const 跑 = 跑长;
  let 上次错 = 0, 上列 = 2;
  const 同列 = (a: number, b: number) => {
    for (let k = 0; k < nz; k++) if (cm[a + k] !== cm[b + k]) return 0;
    return 1;
  };
  for (let c = 0; c < 列数; c++) {
    const base = c * nz, 有W = c % 边 > 0, 有N = c >= 边;
    const bW = 有W ? base - nz : 有N ? base - 边 * nz : -1, bN = 有N ? base - 边 * nz : bW;
    let 整 = false, 源 = 0;
    if (bW >= 0) {
      const 境 = 上列 + 3 * l;
      if (!rc.bit(表, o列 + 境, 同列(base, bW) ? 0 : 1)) {
        源 = bW;
        整 = true;
        上列 = 0;
      } else if (bN !== bW) {
        if (!rc.bit(表, o列 + 境 + 9, 同列(base, bN) ? 0 : 1)) {
          源 = bN;
          整 = true;
          上列 = 1;
        }
      }
      if (!整) 上列 = 2;
    }
    if (整) {
      跑.copyWithin(base, 源, 源 + nz);
      continue;
    }
    let k = nz - 1, 禁 = nz;
    while (k >= 0) {
      const 顶 = k === nz - 1;
      const W = bW >= 0 ? cm[bW + k]! : 0, N = bN >= 0 ? cm[bN + k]! : 0;
      const U = 顶 ? W : cm[base + k + 1]!;
      if (k < 禁 && U === W && U === N) {
        const mW = bW >= 0 ? 跑[bW + k]! : k + 1, mN = bN >= 0 ? 跑[bN + k]! : k + 1;
        const m = mW < mN ? mW : mN;
        if (m >= 2) {
          let 同 = 1;
          for (let j = 0; j < m; j++) {
            if (cm[base + k - j] !== U) {
              同 = 0;
              break;
            }
          }
          const 桶 = 31 - Math.clz32(m), 境 = (桶 > 7 ? 7 : 桶) | (U === 0 ? 8 : 0) | (上次错 << 4) | (顶 ? 32 : 0);
          if (!rc.bit(表, o跳 + 境 + 64 * l, 同 ? 0 : 1, palette[2 * U]!)) {
            k -= m;
            上次错 = 0;
            continue;
          }
          禁 = k - m + 1;
        }
      }
      const W变 = !顶 && bW >= 0 && cm[bW + k] !== cm[bW + k + 1] ? 1 : 0;
      const N变 = !顶 && bN >= 0 && cm[bN + k] !== cm[bN + k + 1] ? 1 : 0;
      const ctx = 偏 + (W变 | (N变 << 1) | (W === U ? 4 : 0) | (N === U ? 8 : 0) | (W === N ? 16 : 0) | (上次错 << 5) | (U === 0 ? 64 : 0));
      const v = cm[base + k]!;
      if (!rc.bit(表, o1 + ctx, v === U ? 0 : 1, palette[2 * U]!)) {
        上次错 = 0;
        k--;
        continue;
      }
      上次错 = 1;
      if (W !== U && !rc.bit(表, o2 + ctx, v === W ? 0 : 1, palette[2 * W]!)) {
        k--;
        continue;
      }
      if (N !== U && N !== W && !rc.bit(表, o3 + ctx, v === N ? 0 : 1, palette[2 * N]!)) {
        k--;
        continue;
      }
      rc.literal?.(U, v);
      let n = 1;
      for (let i = 位 - 1; i >= 0; i--) n = (n << 1) | rc.bit(树, n, (v >> i) & 1, U);
      k--;
    }
    if (nz) 跑[base] = 1;
    for (let z = 1; z < nz; z++) 跑[base + z] = cm[base + z] === cm[base + z - 1] ? 跑[base + z - 1]! + 1 : 1;
  }
};


/** 同一模型和格子生成相同的字节；区段之间不共享自适应状态，支持独立 Range 解码。 */
export const 压区段 = (d: SectionData, 模型: 区段模型, cm: Uint16Array = 到列优先(d)): Uint8Array => {
  const P = d.palette.length / 2;
  if (d.nz > 0xffff || P < 1 || P > 0xffff || d.kBottom < -0x8000 || d.kBottom > 0x7fff) throw new Error(`区段放不进格式：nz ${d.nz}、色板 ${P} 项、kBottom ${d.kBottom}`);
  const ps = new Uint16Array(1371), probs = 模型.init.slice();
  const { tree, n } = 树初值(d.palette, 模型), rc = new 区间编码器(4096);
  走模型({ bit(p, i, b, s = 0) {
    const lit = p !== ps;
    const idx = lit ? 模型.map[d.palette[2 * s]!]! * n + i : (i < 1344 ? 模型.map[s]! * 1371 : 0) + i;
    return rc.bit(lit ? tree : probs, idx, b, lit ? 4 : 5);
  } }, cm, d.nz, P, d.L, ps, d.palette);
  const 流 = rc.完(), out = new Uint8Array(6 + d.palette.byteLength + 流.length), dv = new DataView(out.buffer);
  dv.setUint16(0, d.nz, true); dv.setInt16(2, d.kBottom, true); dv.setUint16(4, P, true);
  out.set(new Uint8Array(d.palette.buffer, d.palette.byteOffset, d.palette.byteLength), 6);
  out.set(流, 6 + d.palette.byteLength);
  return out;
};

export const 压并核对 = (库: 体素库, d: SectionData, 模型: 区段模型): Uint8Array => {
  const cm = 到列优先(d), 压 = 压区段(d, 模型, cm), 解 = 库.区段解码.解区段(压, d, 模型);
  const 同 = (a: Uint16Array, b: Uint16Array) => a.length === b.length && Buffer.compare(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength)) === 0;
  if (解.kBottom !== d.kBottom || 解.nz !== d.nz || !同(解.palette, d.palette) || !同(到列优先(解), cm)) throw new Error(`区段 ${d.L}/${d.i}/${d.j} 压完解回来不一样`);
  return 压;
};

const 树初值 = (palette: Uint16Array, m: 区段模型) => {
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
