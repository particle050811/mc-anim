// 区段的逐格预测压缩（编码半边，代码里叫算术编码）；解码半边是 wasm/区段解码.ts，两边逐条对应。为什么是这个方案见 docs/决策/0011-地形压缩.md。
// 区段的字节（小端）：u16 nz、i16 kBottom、u16 色板项，色板 u16[2·色板项]，接着区间编码流。没有 gzip，L、i、j 由块文件索引的位置定。
// 模型：格子按列优先（一列从上往下）走。每个格子先猜「和上一格一样」，猜错再猜「和左列同高的格一样」「和前列同高的格一样」，都错才记色板号。
//   上下文 = 左、前两列在这一高度变没变，左、前、上三者相不相同，上一次猜错没有，上一格是不是空气。
//   跳过：上、左、前三者相同，且左、前两列接下来 m 格都不变，只记「这 m 格都和上一格一样吗」。
//   整列：这列和左列（再不行前列）完全一样，只记一下。
//   初值：engine/voxel/区段模型表.生成.ts 里按真实地形学好的（训练见 ../区段解码器.ts），色板号的概率因为每区段含义不同，从 1/2 起。
// 走模型 同时给编码器和训练用：训练时 记 只数不写。区间编码器的写法照 LZMA：low 进位靠 double 表示到 2^33，整数运算，平台无关。
import type { SectionData } from '../../../engine/voxel/区段包.ts';
import type { 体素库 } from '../体素库.ts';

const 边 = 34, 列数 = 边 * 边;
export const 区段头长 = 6;
const 移 = 4;
// 模型表的布局（u16 下标）：p1、p2、p3 各 128 × 3 级，跳 64 × 3 级，整列 9 × 3 级
export const 表布局 = { p1: 0, p2: 384, p3: 768, 跳: 1152, 列: 1344, 总: 1371 } as const;
export const 级 = (L: number) => (L === 0 ? 0 : L <= 2 ? 1 : 2);

export interface 记号器 {
  /** 概率数组 ps 第 i 项上记一位，返回这一位 */
  bit(ps: Uint16Array, i: number, b: number): number;
}

class 区间编码器 implements 记号器 {
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
  bit(ps: Uint16Array, i: number, b: number) {
    const p = ps[i]!, bound = (this.range >>> 11) * p;
    if (!b) {
      this.range = bound;
      ps[i] = p + ((2048 - p) >> 移);
    } else {
      this.low += bound;
      this.range -= bound;
      ps[i] = p - (p >> 移);
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

export const 走模型 = (rc: 记号器, cm: Uint16Array, nz: number, 色板项: number, L: number, 表: Uint16Array) => {
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
          if (!rc.bit(表, o跳 + 境 + 64 * l, 同 ? 0 : 1)) {
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
      if (!rc.bit(表, o1 + ctx, v === U ? 0 : 1)) {
        上次错 = 0;
        k--;
        continue;
      }
      上次错 = 1;
      if (W !== U && !rc.bit(表, o2 + ctx, v === W ? 0 : 1)) {
        k--;
        continue;
      }
      if (N !== U && N !== W && !rc.bit(表, o3 + ctx, v === N ? 0 : 1)) {
        k--;
        continue;
      }
      let n = 1;
      for (let i = 位 - 1; i >= 0; i--) n = (n << 1) | rc.bit(树, n, (v >> i) & 1);
      k--;
    }
    if (nz) 跑[base] = 1;
    for (let z = 1; z < nz; z++) 跑[base + z] = cm[base + z] === cm[base + z - 1] ? 跑[base + z - 1]! + 1 : 1;
  }
};

/** 同样的 SectionData 出同样的字节（版本 = 目录指纹靠这个）。初值表 是 库.区段解码.初值表（pipeline 不静态引 engine 的模块）；cm 可以传现成的，省一次摊开 */
export const 压区段 = (d: Pick<SectionData, 'nz' | 'kBottom' | 'palette' | 'runCounts' | 'paletteIndex' | 'runLengths' | 'L'>, 初值表: Uint16Array, cm: Uint16Array = 到列优先(d)): Uint8Array => {
  const 色板项 = d.palette.length / 2;
  if (d.nz > 0xffff || 色板项 > 0xffff || d.kBottom < -0x8000 || d.kBottom > 0x7fff) throw new Error(`区段放不进格式：nz ${d.nz}、色板 ${色板项} 项、kBottom ${d.kBottom}`);
  const rc = new 区间编码器(4096);
  走模型(rc, cm, d.nz, 色板项, d.L, 初值表.slice());
  const 流 = rc.完();
  const out = new Uint8Array(区段头长 + 4 * 色板项 + 流.length);
  const v = new DataView(out.buffer);
  v.setUint16(0, d.nz, true);
  v.setInt16(2, d.kBottom, true);
  v.setUint16(4, 色板项, true);
  out.set(new Uint8Array(d.palette.buffer, d.palette.byteOffset, d.palette.byteLength), 区段头长);
  out.set(流, 区段头长 + 4 * 色板项);
  return out;
};

const 同数组 = (a: Uint16Array, b: Uint16Array) => a.length === b.length && Buffer.compare(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength)) === 0;

/** 压完马上用正式的解码器（WASM）解一遍逐格比：编码和解码两边实现是分开写的，错了不能进包 */
export const 压并核对 = (库: 体素库, d: SectionData): Uint8Array => {
  const cm = 到列优先(d);
  const 压 = 压区段(d, 库.区段解码.初值表, cm);
  const 解 = 库.区段解码.解区段(压, d);
  if (解.kBottom !== d.kBottom || 解.nz !== d.nz || !同数组(解.palette, d.palette) || !同数组(到列优先(解), cm)) throw new Error(`区段 ${d.L}/${d.i}/${d.j} 压完解回来不一样`);
  return 压;
};
