// 每边列数做成参数的区段编码器（照 pipeline/世界/烘焙/区段编码.ts 的 走模型、压区段 抄一份），和把 2×2 个区段拼成 66×66 列的窗口。
// 只给 64×64 的实验用（拼大.ts 量体积、解宽.ts 量解码）；34 列时和正式编码器逐字节相同，拼大.ts 每组先核一遍。
import { 区间编码器, 表布局, 级 as 模型级, type 记号器 } from '../../../pipeline/世界/烘焙/区段编码.ts';
import type { 区段模型 } from '../../../engine/voxel/区段模型.ts';
import { 边, type 格子 } from './公共.ts';

const 走模型宽 = (rc: 记号器, cm: Uint16Array, nz: number, 色板项: number, L: number, 表: Uint16Array, palette: Uint16Array, 宽: number) => {
  const 列数 = 宽 * 宽;
  let 位 = 1;
  while (1 << 位 < 色板项) 位++;
  const 树 = new Uint16Array(1 << 位).fill(1024), l = 模型级(L), 偏 = l * 128;
  const { p1: o1, p2: o2, p3: o3, 跳: o跳, 列: o列 } = 表布局;
  const 跑 = new Uint16Array(列数 * nz);
  let 上次错 = 0, 上列 = 2;
  const 同列 = (a: number, b: number) => { for (let k = 0; k < nz; k++) if (cm[a + k] !== cm[b + k]) return 0; return 1; };
  for (let c = 0; c < 列数; c++) {
    const base = c * nz, 有W = c % 宽 > 0, 有N = c >= 宽;
    const bW = 有W ? base - nz : 有N ? base - 宽 * nz : -1, bN = 有N ? base - 宽 * nz : bW;
    let 整 = false, 源 = 0;
    if (bW >= 0) {
      const 境 = 上列 + 3 * l;
      if (!rc.bit(表, o列 + 境, 同列(base, bW) ? 0 : 1)) { 源 = bW; 整 = true; 上列 = 0; }
      else if (bN !== bW && !rc.bit(表, o列 + 境 + 9, 同列(base, bN) ? 0 : 1)) { 源 = bN; 整 = true; 上列 = 1; }
      if (!整) 上列 = 2;
    }
    if (整) { 跑.copyWithin(base, 源, 源 + nz); continue; }
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
          for (let j = 0; j < m; j++) if (cm[base + k - j] !== U) { 同 = 0; break; }
          const 桶 = 31 - Math.clz32(m), 境 = (桶 > 7 ? 7 : 桶) | (U === 0 ? 8 : 0) | (上次错 << 4) | (顶 ? 32 : 0);
          if (!rc.bit(表, o跳 + 境 + 64 * l, 同 ? 0 : 1, palette[2 * U]!)) { k -= m; 上次错 = 0; continue; }
          禁 = k - m + 1;
        }
      }
      const W变 = !顶 && bW >= 0 && cm[bW + k] !== cm[bW + k + 1] ? 1 : 0;
      const N变 = !顶 && bN >= 0 && cm[bN + k] !== cm[bN + k + 1] ? 1 : 0;
      const ctx = 偏 + (W变 | (N变 << 1) | (W === U ? 4 : 0) | (N === U ? 8 : 0) | (W === N ? 16 : 0) | (上次错 << 5) | (U === 0 ? 64 : 0));
      const v = cm[base + k]!;
      if (!rc.bit(表, o1 + ctx, v === U ? 0 : 1, palette[2 * U]!)) { 上次错 = 0; k--; continue; }
      上次错 = 1;
      if (W !== U && !rc.bit(表, o2 + ctx, v === W ? 0 : 1, palette[2 * W]!)) { k--; continue; }
      if (N !== U && N !== W && !rc.bit(表, o3 + ctx, v === N ? 0 : 1, palette[2 * N]!)) { k--; continue; }
      let n = 1;
      for (let i = 位 - 1; i >= 0; i--) n = (n << 1) | rc.bit(树, n, (v >> i) & 1, U);
      k--;
    }
    if (nz) 跑[base] = 1;
    for (let z = 1; z < nz; z++) 跑[base + z] = cm[base + z] === cm[base + z - 1] ? 跑[base + z - 1]! + 1 : 1;
  }
};
const 树初值 = (palette: Uint16Array, m: 区段模型) => {
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
export const 压宽 = (g: 格子, L: number, 模型: 区段模型): Uint8Array => {
  const 宽 = g.宽 ?? 边, palette = Uint16Array.from(g.色板), P = palette.length / 2;
  const ps = new Uint16Array(1371), probs = 模型.init.slice(), { tree, n } = 树初值(palette, 模型), rc = new 区间编码器(4096);
  走模型宽({ bit(p, i, b, s = 0) {
    const lit = p !== ps;
    const idx = lit ? 模型.map[palette[2 * s]!]! * n + i : (i < 1344 ? 模型.map[s]! * 1371 : 0) + i;
    return rc.bit(lit ? tree : probs, idx, b, lit ? 4 : 5);
  } }, g.cm, g.nz, P, L, ps, palette, 宽);
  const 流 = rc.完(), out = new Uint8Array(6 + palette.byteLength + 流.length), dv = new DataView(out.buffer);
  dv.setUint16(0, g.nz, true); dv.setInt16(2, g.kBottom, true); dv.setUint16(4, P, true);
  out.set(new Uint8Array(palette.buffer), 6);
  out.set(流, 6 + palette.byteLength);
  return out;
};
/** 色板按出现先后重排（列从小到大、列内从上往下）、丢掉没用到的，同 公共.ts 的 成区段 */
export const 排色板 = (g: 格子): 格子 => {
  const 宽 = g.宽 ?? 边, { nz, cm } = g, 新号 = new Int32Array(g.色板.length / 2).fill(-1), 色板 = [g.色板[0]!, g.色板[1]!], 出 = new Uint16Array(cm.length);
  新号[0] = 0;
  for (let c = 0; c < 宽 * 宽; c++) for (let k = nz - 1; k >= 0; k--) {
    const p = cm[c * nz + k]!;
    let q = 新号[p]!;
    if (q < 0) { q = 新号[p] = 色板.length / 2; 色板.push(g.色板[2 * p]!, g.色板[2 * p + 1]!); }
    出[c * nz + k] = q;
  }
  return { ...g, cm: 出, 色板 };
};

export const 大 = 2 * 边 - 2;
/** 四个区段 [西南, 东南, 西北, 东北]（i、j 小的在前）拼成 66×66 */
export const 拼 = (四: 格子[], 石状态: number, 状态满: Uint8Array): 格子 => {
  const kb = Math.min(...四.map((g) => g.kBottom)), nz = Math.max(...四.map((g) => g.kBottom + g.nz)) - kb;
  const 色板 = [四[0]!.色板[0]!, 四[0]!.色板[1]!, 石状态, 65535], 号 = new Map<number, number>([[色板[0]! * 65536 + 色板[1]!, 0], [石状态 * 65536 + 65535, 1]]);
  const 映 = 四.map((g) => Uint16Array.from({ length: g.色板.length / 2 }, (_, p) => {
    const key = g.色板[2 * p]! * 65536 + g.色板[2 * p + 1]!;
    let q = 号.get(key);
    if (q === undefined) { q = 色板.length / 2; 号.set(key, q); 色板.push(g.色板[2 * p]!, g.色板[2 * p + 1]!); }
    return q;
  }));
  const cm = new Uint16Array(大 * 大 * nz);
  for (let Y = 0; Y < 大; Y++) for (let X = 0; X < 大; X++) {
    const 东 = X > 32 ? 1 : 0, 北 = Y > 32 ? 1 : 0, 谁 = 北 * 2 + 东, g = 四[谁]!, m = 映[谁]!;
    const 源 = ((Y - 32 * 北) * 边 + X - 32 * 东) * g.nz, 目 = (Y * 大 + X) * nz, 垫 = g.kBottom - kb;
    cm.fill(1, 目, 目 + 垫);
    for (let k = 0; k < g.nz; k++) cm[目 + 垫 + k] = m[g.cm[源 + k]!]!;
  }
  const 满 = new Uint8Array(色板.length / 2);
  for (let p = 1; p < 满.length; p++) 满[p] = 状态满[色板[2 * p]!]!;
  return { id: { L: 四[0]!.id.L, i: 四[0]!.id.i >> 1, j: 四[0]!.id.j >> 1 }, kBottom: kb, nz, cm, 色板, 满, 石: 1, 宽: 大 };
};
