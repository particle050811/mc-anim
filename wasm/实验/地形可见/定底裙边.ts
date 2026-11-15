// 第二轮（用户 11-14 定）：不截面的定底在 1+3 之后还剩几格；裙边那四圈列放开以后多省多少、网格变没变、裙边面会不会露出来。
//   node wasm/实验/地形可见/定底裙边.ts <包名> (--集 <清单> | --随机 <每级几段>) [--保真 <清单>] [--不计时] > 结果.json
// 邻圈（第 0、33 列）：各级都做，四种做法（整格全换石头／只换被埋的 × 非整格归不归空）都量，验收是网格十一组逐字节相同（两种树叶画法各比一遍）。
// 核心边（第 1、32 列）：只做第 0 级，叠在归空的两种上面；解码计时用「只换被埋的 + 归空 + 核心边」。验收是每种材质前七组逐字节相同、四组裙边盖住的格一格不差（贴图变石头、并得更大）；
// 另查「反例」：被换的格朝着的邻圈格，在第 1 级里的父格是不是整格不透明或树叶（粗级树叶画成实心）。是，邻段换粗一级画时这块裙边面被它整面挡住。
import fs from 'node:fs';
import os from 'node:os';
import { 载入, 开包, 成格子, 抄, 成区段, 压, 键, terrain根, 边, type 格子, type 区段项 } from './公共.ts';
import { 埋格换石, 填封闭腔, 不截面定底, 邻圈归一, 核心边换石, 全窗口 } from './变换.ts';
import { 建网格, 网格全同 } from './核对.ts';
import type { SectionMesh } from '../../../engine/voxel/网格.ts';

const 参 = process.argv.slice(2), 包名 = 参[0]!;
const 取参 = (名: string) => { const i = 参.indexOf(名); return i < 0 ? undefined : 参[i + 1]; };
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const 全包级字节 = 包.级.map((b) => b.reduce((s, x) => s + x.len, 0));
const 保真文件 = 取参('--保真'), 保真 = new Set(保真文件 ? fs.readFileSync(保真文件, 'utf8').split('\n').filter(Boolean) : []);
const 全包保真级字节 = Array.from({ length: 7 }, () => 0);
for (const k of 保真) 全包保真级字节[+k.split('/')[0]!]! += 包.查.get(k)!.len;
let 测: 区段项[];
if (取参('--集')) 测 = fs.readFileSync(取参('--集')!, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)[0]!).filter(Boolean).map((k) => 包.查.get(k)!);
else {
  let seed = 20261114;
  测 = 包.级.flatMap((bin) => { const a = bin.slice(); for (let k = a.length - 1; k > 0; k--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (k + 1); [a[k], a[j]] = [a[j]!, a[k]!]; } return a.slice(0, Number(取参('--随机'))); });
}

const 方案 = ['原样', '不截面定底', '1+3', '+邻圈', '+邻圈归空', '+埋邻圈', '+埋邻圈归空', '+邻圈归空+核心边', '+埋邻圈归空+核心边', '上界1+3'] as const;
type 方案名 = (typeof 方案)[number];
const 零 = () => Object.fromEntries(方案.map((k) => [k, 0])) as Record<方案名, number>;
const 级 = Array.from({ length: 7 }, () => ({ 段: 0, 字节: 零() }));
const 材质 = ['实心', '镂空', '实心树叶', '水', '花草'] as const;
const 字节 = (a: Int16Array | Uint16Array | Uint8Array, 起: number, 止: number, 每面: number) => Buffer.from(a.buffer, a.byteOffset + 起 * 每面 * a.BYTES_PER_ELEMENT, (止 - 起) * 每面 * a.BYTES_PER_ELEMENT);
const 网格字节 = (m: SectionMesh) => 材质.reduce((s, k) => s + m[k].pos.byteLength + m[k].uv.byteLength + m[k].tex.byteLength + m[k].col.byteLength, 0);
/** 每种材质的前七组（不含裙边）逐字节相同 */
const 前七组同 = (a: SectionMesh, b: SectionMesh) => 材质.every((m) => {
  const x = a[m], y = b[m];
  if (x.段.slice(0, 8).join() !== y.段.slice(0, 8).join()) return false;
  const n = x.段[7]!;
  return !字节(x.pos, 0, n, 12).compare(字节(y.pos, 0, n, 12)) && !字节(x.uv, 0, n, 8).compare(字节(y.uv, 0, n, 8)) && !字节(x.tex, 0, n, 16).compare(字节(y.tex, 0, n, 16)) && !字节(x.col, 0, n, 16).compare(字节(y.col, 0, n, 16));
});
/** 四组裙边各盖住哪些格（墙面上每格被几个面盖着），连同裙边面数 */
const 裙边 = (m: SectionMesh, nz: number) => {
  const 盖 = new Uint8Array(4 * 32 * nz);
  let 面 = 0;
  for (const k of 材质) for (let d = 0; d < 4; d++) for (let q = m[k].段[7 + d]!; q < m[k].段[8 + d]!; q++) {
    面++;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let v = 0; v < 4; v++) { const u = m[k].pos[q * 12 + v * 3 + (d < 2 ? 1 : 0)]! / 64, z = m[k].pos[q * 12 + v * 3 + 2]! / 64; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, z); v1 = Math.max(v1, z); }
    for (let u = Math.floor(u0); u < Math.ceil(u1); u++) for (let z = Math.floor(v0); z < Math.ceil(v1); z++) 盖[(d * 32 + u) * nz + z]!++;
  }
  return { 盖, 面 };
};

// 第 1 级区段只留挡面掩码，查反例用
const 粗缓存 = new Map<string, { kBottom: number; nz: number; 罩: Uint8Array } | null>();
const 粗段 = (i: number, j: number) => {
  const k = `${i},${j}`;
  if (粗缓存.has(k)) return 粗缓存.get(k)!;
  const 项 = 包.查.get(键({ L: 1, i, j }));
  let v: { kBottom: number; nz: number; 罩: Uint8Array } | null = null;
  if (项) { const g = 成格子(包, 包.解(项)); v = { kBottom: g.kBottom, nz: g.nz, 罩: Uint8Array.from(g.cm, (p) => (p ? 包.状态罩[g.色板[2 * p]!]! : 0)) }; }
  if (粗缓存.size > 48) 粗缓存.clear();
  粗缓存.set(k, v);
  return v;
};

const 核 = {
  不截面定底: { 网格全同: 0, 不同: 0, 单做换的格: 0, 埋格换石换的格: 0, '在1之后还动的格': 0, '在1+3之后还动的格': 0 },
  邻圈: Object.fromEntries(['+邻圈', '+邻圈归空', '+埋邻圈', '+埋邻圈归空'].map((k) => [k, { 全同: 0, 不同: 0, 另一种树叶画法不同: 0, 换的格: 0 }])) as Record<'+邻圈' | '+邻圈归空' | '+埋邻圈' | '+埋邻圈归空', { 全同: number; 不同: number; 另一种树叶画法不同: number; 换的格: number }>,
  核心边: {
    段: 0, 换的格: 0, 包边不动的侧: 0, 前七组全同: 0, 前七组不同: 0, 裙边盖的格全同: 0, 裙边盖的格不同: 0,
    裙边面前: 0, 裙边面后: 0, 全部面前: 0, 全部面后: 0, 网格字节前: 0, 网格字节后: 0,
    // 被换的格每朝一侧邻圈算一条；父格 = 那个邻圈格在第 1 级里所在的格
    // 在粗段 k底 以下：那里粗段不画，按网格的规矩当实心；头顶 = 粗段那一列最下面存着的一格，它实心就看不下去
    父格: { 整格不透明: 0, 树叶: 0, 在粗段k底以下_头顶实心: 0, 在粗段k底以下_头顶不实: 0, 没有粗段: 0, 反例_不挡: 0, 反例_高过粗段顶: 0 },
  },
};
const 坏段: string[] = [], 反例: string[] = [];
const 流: Record<'原样' | '最终', Uint8Array[]> = { 原样: [], 最终: [] };

for (const s of 测) {
  const raw = 包.读(s);
  if (保真.has(键(s.id))) { 流.原样.push(raw); 流.最终.push(raw); continue; }
  const g0 = 成格子(包, 环.库.区段解码.解区段(raw, s.id, 包.模型)), st = 级[s.id.L]!, 粗 = s.id.L >= 1;
  st.段++;
  const 出 = (名: 方案名, g: 格子) => { const b = 压(环, 成区段(g), 包.模型); st.字节[名] += b.length; return b; };
  流.原样.push(出('原样', g0));
  const m0 = 建网格(环, 包, g0);

  // 不截面定底：单做；再看 1、1+3 之后它还动不动得了
  const ga = 抄(g0), na = 不截面定底(ga);
  出('不截面定底', ga);
  核.不截面定底.单做换的格 += na;
  if (网格全同(m0, 建网格(环, 包, ga))) 核.不截面定底.网格全同++; else { 核.不截面定底.不同++; 坏段.push(`不截面定底 ${键(s.id)}`); }
  const g1 = 抄(g0);
  核.不截面定底.埋格换石换的格 += 埋格换石(g1);
  核.不截面定底['在1之后还动的格'] += 不截面定底(g1);
  const g3 = 抄(g0);
  填封闭腔(g3);
  const g13 = 抄(g3);
  埋格换石(g13);
  出('1+3', g13);
  核.不截面定底['在1+3之后还动的格'] += 不截面定底(抄(g13));
  const m13 = 建网格(环, 包, g13), m13叶 = 建网格(环, 包, g13, !粗);

  // 邻圈四种做法：整格全换／只换被埋的 × 非整格归不归空，各自核对网格十一组全同；核心边（只第 0 级）叠在两种归空的上面
  const 归空 = Uint8Array.from({ length: g13.色板.length / 2 }, (_, p) => (p && 包.状态罩[g13.色板[2 * p]!] === 0 ? 1 : 0));
  const 有邻 = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => 包.查.has(键({ L: s.id.L, i: s.id.i + a!, j: s.id.j + b! })));
  let 核心边改: Int32Array | undefined, gβ: 格子 | undefined;
  for (const [名, 只埋, 空] of [['+邻圈', false, false], ['+邻圈归空', false, true], ['+埋邻圈', true, false], ['+埋邻圈归空', true, true]] as const) {
    const g = 抄(g13), 记 = 核.邻圈[名];
    记.换的格 += 邻圈归一(g, 只埋, 空 ? 归空 : undefined);
    出(名, g);
    if (网格全同(m13, 建网格(环, 包, g))) 记.全同++; else { 记.不同++; 坏段.push(`${名} ${键(s.id)}`); }
    if (!网格全同(m13叶, 建网格(环, 包, g, !粗))) 记.另一种树叶画法不同++;
    if (!空) continue;
    if (!粗) 核心边改 = 核心边换石(g, 有邻);
    const b = 出(`${名}+核心边`, g);
    if (只埋) { gβ = g; 流.最终.push(b); }
  }
  if (!粗) {
    const c = 核.核心边, 改 = 核心边改!, { i, j } = s.id, mβ = 建网格(环, 包, gβ!), 裙前 = 裙边(m13, g0.nz), 裙后 = 裙边(mβ, g0.nz);
    c.段++; c.换的格 += 改.length; c.包边不动的侧 += 有邻.filter((x) => !x).length;
    if (前七组同(m13, mβ)) c.前七组全同++; else { c.前七组不同++; 坏段.push(`核心边前七组 ${键(s.id)}`); }
    if (!Buffer.compare(裙前.盖, 裙后.盖)) c.裙边盖的格全同++; else { c.裙边盖的格不同++; 坏段.push(`核心边裙边盖的格 ${键(s.id)}`); }
    c.裙边面前 += 裙前.面; c.裙边面后 += 裙后.面; c.全部面前 += m13.面数; c.全部面后 += mβ.面数; c.网格字节前 += 网格字节(m13); c.网格字节后 += 网格字节(mβ);
    for (const at of 改) {
      const col = Math.floor(at / g0.nz), k = at - col * g0.nz, x = col % 边, y = (col - x) / 边;
      for (const [在边, ax, ay] of [[x === 边 - 2, 边 - 1, y], [x === 1, 0, y], [y === 边 - 2, x, 边 - 1], [y === 1, x, 0]] as [boolean, number, number][]) {
        if (!在边) continue;
        const X = Math.floor((32 * i + ax - 1) / 2), Y = Math.floor((32 * j + ay - 1) / 2), Z = Math.floor((g0.kBottom + k) / 2);
        const pi = Math.floor(X / 32), pj = Math.floor(Y / 32), p = 粗段(pi, pj);
        if (!p) { c.父格.没有粗段++; continue; }
        const k1 = Z - p.kBottom, 列 = ((Y - 32 * pj + 1) * 边 + X - 32 * pi + 1) * p.nz;
        if (k1 < 0) { if (p.罩[列]! & 3) c.父格.在粗段k底以下_头顶实心++; else c.父格.在粗段k底以下_头顶不实++; continue; }
        if (k1 >= p.nz) { c.父格.反例_高过粗段顶++; if (反例.length < 20) 反例.push(`${键(s.id)} 格 ${x},${y},${k} 父格高过粗段顶`); continue; }
        const 罩 = p.罩[列 + k1]!;
        if (罩 & 1) c.父格.整格不透明++; else if (罩 & 2) c.父格.树叶++; else { c.父格.反例_不挡++; if (反例.length < 20) 反例.push(`${键(s.id)} 格 ${x},${y},${k} 父格掩码 ${罩}`); }
      }
    }
  }

  const gu = 抄(g3);
  埋格换石(gu, 全窗口);
  出('上界1+3', gu);
}

// 解码耗时：同 量.ts 的口径，A/B/B/A 各解 8 遍整个集合
let 计时: { 轮: { 谁: string; ms: number }[]; 比: [number, number] } | undefined;
if (!参.includes('--不计时')) {
  const 轮: { 谁: string; ms: number }[] = [];
  for (const 谁 of ['A', 'B', 'B', 'A']) {
    const t = performance.now();
    for (let rep = 0; rep < 8; rep++) 测.forEach((s, i) => 环.库.区段解码.解区段((谁 === 'A' ? 流.原样 : 流.最终)[i]!, s.id, 包.模型));
    轮.push({ 谁, ms: performance.now() - t });
  }
  计时 = { 轮, 比: [轮[1]!.ms / 轮[0]!.ms, 轮[2]!.ms / 轮[3]!.ms] };
}

const 合计 = 零(), 样本字节 = 零();
for (const 名 of 方案) for (let L = 0; L < 7; L++) {
  样本字节[名] += 级[L]!.字节[名];
  if (级[L]!.段) 合计[名] += 全包保真级字节[L]! + (全包级字节[L]! - 全包保真级字节[L]!) * 级[L]!.字节[名] / 级[L]!.字节.原样;
}
const 全包区段字节 = 全包级字节.reduce((a, b) => a + b, 0);
console.log(JSON.stringify({
  包: 包名, 集: 取参('--集') ?? `随机每级 ${取参('--随机')}`, 段数: 测.length, 负载: os.loadavg(), 保真: 保真文件 ?? null, 全包区段字节,
  样本比: Object.fromEntries(方案.map((k) => [k, 样本字节[k] / 样本字节.原样])),
  加权估计比: 取参('--集') ? undefined : Object.fromEntries(方案.map((k) => [k, 合计[k] / 全包区段字节])),
  加权估计字节: 取参('--集') ? undefined : Object.fromEntries(方案.map((k) => [k, Math.round(合计[k])])),
  级: 级.map((x, L) => ({ L, 段: x.段, 比: Object.fromEntries(方案.map((k) => [k, x.段 ? x.字节[k] / x.字节.原样 : null])) })),
  核, 坏段: 坏段.slice(0, 40), 坏段数: 坏段.length, 反例, 计时,
}, null, 1));
