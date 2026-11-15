// 变换 4：把相邻 2×2 个区段拼成一个 64×64 的区段（带一圈相邻格是 66×66 列）再编码，只量体积，不改格式、没有解码器（解码耗时量不了）。
//   node wasm/实验/地形可见/拼大.ts <包名> [--每级 <最多几组，默认 40>] [--保真 <清单>] > 结果.json
// 组从留出集里挑：留出的区段所在的 2×2（i>>1、j>>1），四个都在包里、都不在保真清单里才算。
// 拼法：每列取它是核心的那个区段的抄本；四个区段各自的 k底 不一样，拼出来从最低的 k底 起，各列自己 k底 以下填石头（现在本来就不存、当实心）、顶上填空气。
//   真烘 64×64 时这一截存的是真方块（多半也是埋住的），所以这里略偏乐观。
// 「拼后再做」= 在 66 列的窗口上再做一遍 3、1：原来四个区段之间的边不再是核心的边，裙边那两列也能动了。
// 编码器照 pipeline/世界/烘焙/区段编码.ts 的 走模型、压区段 抄一份、只把每边列数改成参数；每组先用 34 列压一个原区段，和正式编码器逐字节相同才往下算。
import fs from 'node:fs';
import { 区间编码器, 表布局, 级 as 模型级, 压区段, type 记号器 } from '../../../pipeline/世界/烘焙/区段编码.ts';
import type { 区段模型 } from '../../../engine/voxel/区段模型.ts';
import { 载入, 开包, 留出集, 成格子, 抄, 成区段, 键, terrain根, 边, type 格子, type 区段项 } from './公共.ts';
import { 埋格换石, 填封闭腔 } from './变换.ts';

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
/** 格子（色板已按出现先后排好）→ 字节数；头和色板的算法同格式 3 */
const 压宽 = (g: 格子, L: number, 模型: 区段模型): Uint8Array => {
  const 宽 = g.宽 ?? 边, palette = Uint16Array.from(g.色板), P = palette.length / 2;
  const ps = new Uint16Array(1371), probs = 模型.init.slice(), { tree, n } = 树初值(palette, 模型), rc = new 区间编码器(4096);
  走模型宽({ bit(p, i, b, s = 0) {
    const lit = p !== ps;
    const idx = lit ? 模型.map[palette[2 * s]!]! * n + i : (i < 1344 ? 模型.map[s]! * 1371 : 0) + i;
    return rc.bit(lit ? tree : probs, idx, b, lit ? 4 : 5);
  } }, g.cm, g.nz, P, L, ps, palette, 宽);
  const 流 = rc.完(), out = new Uint8Array(6 + palette.byteLength + 流.length);
  out.set(流, 6 + palette.byteLength);
  return out;
};
/** 色板按出现先后重排（列从小到大、列内从上往下）、丢掉没用到的，同 公共.ts 的 成区段 */
const 排色板 = (g: 格子): 格子 => {
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

const 大 = 2 * 边 - 2;
/** 四个区段 [西南, 东南, 西北, 东北]（i、j 小的在前）拼成 66×66 */
const 拼 = (四: 格子[], 石状态: number, 状态满: Uint8Array): 格子 => {
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

const 参 = process.argv.slice(2), 包名 = 参[0]!;
const 取参 = (名: string) => { const i = 参.indexOf(名); return i < 0 ? undefined : 参[i + 1]; };
const 每级 = Number(取参('--每级') ?? 40);
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const 全包级字节 = 包.级.map((b) => b.reduce((s, x) => s + x.len, 0));
const 保真文件 = 取参('--保真'), 保真 = new Set(保真文件 ? fs.readFileSync(保真文件, 'utf8').split('\n').filter(Boolean) : []);
const 列 = ['四个原样', '拼原样', '四个1+3', '拼1+3', '拼后再做1+3'] as const;
const 统 = Array.from({ length: 7 }, () => ({ 组: 0, ...(Object.fromEntries(列.map((k) => [k, 0])) as Record<(typeof 列)[number], number>) }));
const 见 = new Set<string>();
let 抄本不同 = 0;
for (const s of 留出集(包).测) {
  const { L } = s.id, a = s.id.i >> 1, b = s.id.j >> 1, 组键 = `${L}/${a}/${b}`, st = 统[L]!;
  if (见.has(组键) || st.组 >= 每级) continue;
  见.add(组键);
  const 项 = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([di, dj]) => 包.查.get(键({ L, i: 2 * a + di!, j: 2 * b + dj! })));
  if (项.some((x) => !x || 保真.has(键(x.id)))) continue;
  const 原 = (项 as 区段项[]).map((x) => 成格子(包, 包.解(x)));
  // 抄的编码器先对一下：34 列压第一个区段，要和正式编码器逐字节相同
  const d0 = 成区段(原[0]!), 正式 = 压区段(d0, 包.模型), 抄的 = 压宽({ ...原[0]!, cm: 排色板(原[0]!).cm, 色板: Array.from(d0.palette) }, L, 包.模型);
  if (正式.length !== 抄的.length || Buffer.compare(正式.subarray(6 + d0.palette.byteLength), 抄的.subarray(6 + d0.palette.byteLength))) throw new Error(`抄的编码器和正式的不一样：${键(原[0]!.id)}`);
  const 后 = 原.map((g) => { const h = 抄(g); 填封闭腔(h); 埋格换石(h); return h; });
  // 留裙边的做法下，相邻区段共用的那几列两份抄本应该一样
  for (const [甲, 乙, 竖] of [[0, 1, 0], [2, 3, 0], [0, 2, 1], [1, 3, 1]] as const) {
    const A = 后[甲]!, B = 后[乙]!;
    for (let t = 0; t < 边; t++) for (const [ca, cb] of [[32, 0], [33, 1]] as const) {
      const pa = 竖 ? ca * 边 + t : t * 边 + ca, pb = 竖 ? cb * 边 + t : t * 边 + cb;
      for (let z = Math.max(A.kBottom, B.kBottom); z < Math.min(A.kBottom + A.nz, B.kBottom + B.nz); z++) {
        const x = A.cm[pa * A.nz + z - A.kBottom]!, y = B.cm[pb * B.nz + z - B.kBottom]!;
        if (A.色板[2 * x] !== B.色板[2 * y] || A.色板[2 * x + 1] !== B.色板[2 * y + 1]) 抄本不同++;
      }
    }
  }
  st.组++;
  st.四个原样 += (项 as 区段项[]).reduce((n, x) => n + x.len, 0);
  st['四个1+3'] += 后.reduce((n, g) => n + 压区段(成区段(g), 包.模型).length, 0);
  st.拼原样 += 压宽(排色板(拼(原, 包.石状态, 包.状态满)), L, 包.模型).length;
  const 拼后 = 拼(后, 包.石状态, 包.状态满);
  st['拼1+3'] += 压宽(排色板(拼后), L, 包.模型).length;
  填封闭腔(拼后); 埋格换石(拼后);
  st['拼后再做1+3'] += 压宽(排色板(拼后), L, 包.模型).length;
}
const 合 = Object.fromEntries(列.map((k) => [k, 0])) as Record<(typeof 列)[number], number>;
let 权 = 0;
for (let L = 0; L < 7; L++) if (统[L]!.组) { 权 += 全包级字节[L]!; for (const k of 列) 合[k] += 全包级字节[L]! * 统[L]![k] / 统[L]!.四个原样; }
console.log(JSON.stringify({
  包: 包名, 每级, 保真: 保真文件 ?? null, 抄本不同的格: 抄本不同,
  级: 统.map((x, L) => ({ L, ...x, 拼比四个_原样: x.组 ? x.拼原样 / x.四个原样 : null, 拼比四个_1加3: x.组 ? x['拼1+3'] / x['四个1+3'] : null, 拼后再做比四个_1加3: x.组 ? x['拼后再做1+3'] / x['四个1+3'] : null })),
  // 各级样本比 × 全包该级区段字节；没有成组样本的级不算进分母
  加权估计_对现行格式: Object.fromEntries(列.map((k) => [k, 合[k] / 权])), 加权覆盖的字节占比: 权 / 全包级字节.reduce((a, b) => a + b, 0),
}, null, 1));
