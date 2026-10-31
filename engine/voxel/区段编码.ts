// 区段的两种试验编码（只在实验分支，不进正式包）：块文件里每段的第一个字节定格式，解出来还是 SectionData，别的地方不用知道。
//   gzip（0x1f 开头）解开后看魔数：MCQD 是现有格式（区段包.ts），MCQP 是列间预测。
//   0xA7：上下文算术编码，不包 gzip，色板直接存。模型照 run/草稿/…/图片压缩/量压缩.mts 的 D。
// L、i、j 由块表的位置决定，不存，调用方给。
// 算术解码写成一个大函数（不用类、不和编码器共用模型）：编码、解码共用时调用点是多态的，慢一截；临时数组模块级复用，一个工人一份，解码是同步的。
import type { SectionData } from './区段包.ts';

const 边 = 34, 列数 = 边 * 边;
export const 算术标记 = 0xa7;
export const 列间魔数 = 0x5051434d; // "MCQP"

export type 区段号 = { L: number; i: number; j: number };

const p1 = new Uint16Array(128), p2 = new Uint16Array(128), p3 = new Uint16Array(128);
let 树 = new Uint16Array(1 << 12);
let 号缓 = new Uint16Array(1 << 16), 长缓 = new Uint16Array(1 << 16);
const 数缓 = new Uint16Array(列数);

export const 色板位数 = (色板项: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, 色板项))));

/** 解一个算术编码的区段。vox 和 SectionData 对得上（sectionToVoxels 摊开的结果），调用方有用就省一次摊开；data 的四个数组同一块缓冲 */
export const 解算术区段 = (b: Uint8Array, id: 区段号): { data: SectionData; vox: Uint16Array } => {
  const nz = b[1]! | (b[2]! << 8);
  const kBottom = ((b[3]! | (b[4]! << 8)) << 16) >> 16;
  const 色板项 = b[5]! | (b[6]! << 8);
  const 色 = new Uint16Array(2 * 色板项);
  let at = 7;
  for (let n = 0; n < 色.length; n++, at += 2) 色[n] = b[at]! | (b[at + 1]! << 8);
  const 总格 = 列数 * nz;
  if (号缓.length < 总格) {
    号缓 = new Uint16Array(总格);
    长缓 = new Uint16Array(总格);
  }
  const 位 = 色板位数(色板项), 树大 = 1 << 位;
  if (树.length < 树大) 树 = new Uint16Array(树大);
  p1.fill(1024);
  p2.fill(1024);
  p3.fill(1024);
  树.fill(1024, 0, 树大);
  const vox = new Uint16Array(总格);
  const 号们 = 号缓, 长们 = 长缓, 树们 = 树;
  let range = 0xffffffff, code = 0;
  for (let n = 0; n < 4; n++) code = (code * 256 + b[at++]!) >>> 0;
  let 上次错 = 0, R = 0;
  for (let c = 0; c < 列数; c++) {
    const 有W = c % 边 > 0, 有N = c >= 边;
    const R起 = R;
    let 号 = -1, 长 = 0;
    for (let k = nz - 1; k >= 0; k--) {
      const a = k * 列数 + c, 顶 = k === nz - 1;
      const w = 有W ? vox[a - 1]! : 有N ? vox[a - 边]! : 0;
      const n = 有N ? vox[a - 边]! : w;
      const u = 顶 ? w : vox[a + 列数]!;
      const w变 = !顶 && 有W && w !== vox[a + 列数 - 1]! ? 1 : 0;
      const n变 = !顶 && 有N && n !== vox[a + 列数 - 边]! ? 2 : 0;
      const ctx = w变 | n变 | (w === u ? 4 : 0) | (n === u ? 8 : 0) | (w === n ? 16 : 0) | (上次错 << 5) | (u === 0 ? 64 : 0);
      let v: number;
      let p = p1[ctx]!, bound = (range >>> 11) * p;
      if (code < bound) {
        range = bound;
        p1[ctx] = p + ((2048 - p) >> 4);
        while (range < 0x1000000) {
          code = (code * 256 + b[at++]!) >>> 0;
          range *= 256;
        }
        v = u;
        上次错 = 0;
      } else {
        code -= bound;
        range -= bound;
        p1[ctx] = p - (p >> 4);
        while (range < 0x1000000) {
          code = (code * 256 + b[at++]!) >>> 0;
          range *= 256;
        }
        上次错 = 1;
        v = -1;
        if (w !== u) {
          p = p2[ctx]!;
          bound = (range >>> 11) * p;
          if (code < bound) {
            range = bound;
            p2[ctx] = p + ((2048 - p) >> 4);
            v = w;
          } else {
            code -= bound;
            range -= bound;
            p2[ctx] = p - (p >> 4);
          }
          while (range < 0x1000000) {
            code = (code * 256 + b[at++]!) >>> 0;
            range *= 256;
          }
        }
        if (v < 0 && n !== u && n !== w) {
          p = p3[ctx]!;
          bound = (range >>> 11) * p;
          if (code < bound) {
            range = bound;
            p3[ctx] = p + ((2048 - p) >> 4);
            v = n;
          } else {
            code -= bound;
            range -= bound;
            p3[ctx] = p - (p >> 4);
          }
          while (range < 0x1000000) {
            code = (code * 256 + b[at++]!) >>> 0;
            range *= 256;
          }
        }
        if (v < 0) {
          let m = 1;
          for (let i = 位 - 1; i >= 0; i--) {
            p = 树们[m]!;
            bound = (range >>> 11) * p;
            if (code < bound) {
              range = bound;
              树们[m] = p + ((2048 - p) >> 4);
              m = m << 1;
            } else {
              code -= bound;
              range -= bound;
              树们[m] = p - (p >> 4);
              m = (m << 1) | 1;
            }
            while (range < 0x1000000) {
              code = (code * 256 + b[at++]!) >>> 0;
              range *= 256;
            }
          }
          v = m - 树大;
        }
      }
      vox[a] = v;
      if (v === 号) 长++;
      else {
        if (长) {
          号们[R] = 号;
          长们[R++] = 长;
        }
        号 = v;
        长 = 1;
      }
    }
    if (长) {
      号们[R] = 号;
      长们[R++] = 长;
    }
    数缓[c] = R - R起;
  }
  const ab = new ArrayBuffer((2 * 色板项 + 列数 + 2 * R) * 2);
  const palette = new Uint16Array(ab, 0, 2 * 色板项);
  const runCounts = new Uint16Array(ab, palette.byteLength, 列数);
  const paletteIndex = new Uint16Array(ab, palette.byteLength + runCounts.byteLength, R);
  const runLengths = new Uint16Array(ab, palette.byteLength + runCounts.byteLength + paletteIndex.byteLength, R);
  palette.set(色);
  runCounts.set(数缓);
  paletteIndex.set(号们.subarray(0, R));
  runLengths.set(长们.subarray(0, R));
  return { data: { L: id.L, i: id.i, j: id.j, kBottom, nz, palette, runCounts, paletteIndex, runLengths }, vox };
};

/** 解一个列间预测的区段（gzip 已解开）。布局：MCQP、kBottom、nz、色板项、记下的列数、段数（各 4 字节），色板，模式[列数]，再是 段数、号、长（各自低字节一串、高字节一串） */
export const 解列间区段 = (r: Uint8Array, id: 区段号): SectionData => {
  const dv = new DataView(r.buffer, r.byteOffset, r.byteLength);
  const kBottom = dv.getInt32(4, true), nz = dv.getUint32(8, true), 色板项 = dv.getUint32(12, true), n数 = dv.getUint32(16, true), n号 = dv.getUint32(20, true);
  let w = 24;
  const 色起 = w;
  w += 色板项 * 4;
  const 模起 = w;
  w += 列数;
  const 数低 = w, 数高 = w + n数;
  w += 2 * n数;
  const 号低 = w, 号高 = w + n号;
  w += 2 * n号;
  const 长低 = w, 长高 = w + n号;
  // 先算每列段数和总段数，才知道要多大的缓冲
  let R = 0, ci = 0;
  for (let c = 0; c < 列数; c++) {
    const 模 = r[模起 + c]!;
    const n = 模 === 1 ? 数缓[c - 1]! : 模 === 2 ? 数缓[c - 边]! : (ci++, r[数低 + ci - 1]! | (r[数高 + ci - 1]! << 8));
    数缓[c] = n;
    R += n;
  }
  const ab = new ArrayBuffer((2 * 色板项 + 列数 + 2 * R) * 2);
  const palette = new Uint16Array(ab, 0, 2 * 色板项);
  const runCounts = new Uint16Array(ab, palette.byteLength, 列数);
  const paletteIndex = new Uint16Array(ab, palette.byteLength + runCounts.byteLength, R);
  const runLengths = new Uint16Array(ab, palette.byteLength + runCounts.byteLength + paletteIndex.byteLength, R);
  for (let n = 0; n < 2 * 色板项; n++) palette[n] = r[色起 + 2 * n]! | (r[色起 + 2 * n + 1]! << 8);
  runCounts.set(数缓);
  const 列始 = new Uint32Array(列数 + 1);
  for (let c = 0; c < 列数; c++) 列始[c + 1] = 列始[c]! + 数缓[c]!;
  let ri = 0;
  for (let c = 0; c < 列数; c++) {
    const 模 = r[模起 + c]!, 始 = 列始[c]!, 终 = 列始[c + 1]!;
    if (模) {
      const 源 = 列始[模 === 1 ? c - 1 : c - 边]!;
      paletteIndex.copyWithin(始, 源, 源 + 终 - 始);
      runLengths.copyWithin(始, 源, 源 + 终 - 始);
      continue;
    }
    for (let x = 始; x < 终; x++, ri++) {
      paletteIndex[x] = r[号低 + ri]! | (r[号高 + ri]! << 8);
      runLengths[x] = r[长低 + ri]! | (r[长高 + ri]! << 8);
    }
  }
  return { L: id.L, i: id.i, j: id.j, kBottom, nz, palette, runCounts, paletteIndex, runLengths };
};
