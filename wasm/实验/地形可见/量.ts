// 抽样实测：每种变换和叠加的体积、网格核对、解码耗时。只读包、只抽样，单线程；用 nice -n 19 跑。
//   node wasm/实验/地形可见/量.ts <包名> [--集 <每行一个 L/i/j 的文件>] [--不计时] > 结果.json
// 不给 --集 就用和 wasm/实验/测地形.mjs 同一个留出集（种子 31841，按 L 分层）。
import fs from 'node:fs';
import os from 'node:os';
import { 载入, 开包, 留出集, 成格子, 抄, 成区段, 压, 键, terrain根, 边, type 格子, type 区段项 } from './公共.ts';
import { 埋格换石, 填封闭腔, 按列定底, 露天连通, 全窗口 } from './变换.ts';
import { 建网格, 网格全同, 比面, 封闭, 不透明性变了 } from './核对.ts';

const 参 = process.argv.slice(2), 包名 = 参[0]!;
const 取参 = (名: string) => { const i = 参.indexOf(名); return i < 0 ? undefined : 参[i + 1]; };
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const 全包级字节 = 包.级.map((b) => b.reduce((s, x) => s + x.len, 0)), 全包级段数 = 包.级.map((b) => b.length);
let 测: 区段项[];
const 集文件 = 取参('--集');
if (集文件) 测 = fs.readFileSync(集文件, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)[0]!).filter(Boolean).map((k) => { const s = 包.查.get(k); if (!s) throw new Error(`包里没有区段 ${k}`); return s; });
else 测 = 留出集(包).测;

const 方案 = ['原样', '1埋格', '3封腔', '1+3', '2定底', '1+2+3', '上界1+3', '上界1+2+3'] as const;
type 方案名 = (typeof 方案)[number];
const 零 = () => Object.fromEntries(方案.map((k) => [k, 0])) as Record<方案名, number>;
const 级 = Array.from({ length: 7 }, () => ({ 段: 0, 格: 0, 字节: 零(), 换格: 零() }));
const 核 = {
  重编不同: 0, // 原样重排色板再压，和包里的字节不一样的区段数（应为 0：说明重排色板和烘焙一致）
  '1埋格': { 全同: 0, 不同: 0, 另一种树叶画法不同: 0, 不透明性变的格: 0 },
  '3封腔': { 全同: 0, 只少不改: 0, 坏: 0, 少的面: 0, 多的面: 0, 少的不贴: 0, 不封闭的格: 0, 填的格: 0, 有填的段: 0 },
  '1+3': { 对3封腔全同: 0, 不同: 0, 另一种树叶画法不同: 0 },
  // 按列定底会动看得见的格：对 1+3 的网格比。确定露天 = 从本段最上一层往下漫得到的非整格、和贴着它的整格；连到段边 = 只经核心的边或相邻那圈连出去的
  '2定底': { 对原样全同: 0, 对原样不同: 0 },
  '1+2+3': { 对1加3全同: 0, 不同: 0, 少的面: 0, 多的面: 0, 动了确定露天的段: 0, 动了确定露天的格: 0, 只动连到段边的段: 0, 动了连到段边的格: 0 },
};
const 坏段: string[] = [], 定底伤: { 段: string; 确定露天格: number; 连到段边格: number; 少: number; 多: number }[] = [];
const 流: Record<方案名, Uint8Array[]> = Object.fromEntries(方案.map((k) => [k, []])) as never;

const 起 = performance.now();
for (const s of 测) {
  const raw = 包.读(s), d = 环.库.区段解码.解区段(raw, s.id, 包.模型), g0 = 成格子(包, d), st = 级[s.id.L]!;
  st.段++; st.格 += g0.cm.length;
  const 出 = (名: 方案名, g: 格子, 换: number) => { const b = 压(环, 成区段(g), 包.模型); st.字节[名] += b.length; st.换格[名] += 换; 流[名].push(b); return b; };
  const 原压 = 出('原样', g0, 0);
  if (Buffer.compare(原压, raw)) 核.重编不同++;
  const m0 = 建网格(环, 包, g0), m0叶 = 建网格(环, 包, g0, !(s.id.L >= 1));

  const g1 = 抄(g0), n1 = 埋格换石(g1);
  出('1埋格', g1, n1);
  核['1埋格'].不透明性变的格 += 不透明性变了(g0, g1);
  if (网格全同(m0, 建网格(环, 包, g1))) 核['1埋格'].全同++; else { 核['1埋格'].不同++; 坏段.push(`1埋格 ${键(s.id)}`); }
  if (!网格全同(m0叶, 建网格(环, 包, g1, !(s.id.L >= 1)))) 核['1埋格'].另一种树叶画法不同++;

  const g3 = 抄(g0), 填 = 填封闭腔(g3), 贴 = new Uint8Array(g0.cm.length);
  for (const at of 填) 贴[at] = 1;
  出('3封腔', g3, 填.length);
  const m3 = 建网格(环, 包, g3), 差3 = 比面(m0, m3, g0.nz, 贴), 不封 = 封闭(g0, 填);
  核['3封腔'].填的格 += 填.length; 核['3封腔'].有填的段 += 填.length ? 1 : 0;
  核['3封腔'].少的面 += 差3.少; 核['3封腔'].多的面 += 差3.多; 核['3封腔'].少的不贴 += 差3.少的不贴; 核['3封腔'].不封闭的格 += 不封;
  if (网格全同(m0, m3)) 核['3封腔'].全同++;
  else if (!差3.多 && !差3.少的不贴 && !不封) 核['3封腔'].只少不改++;
  else { 核['3封腔'].坏++; 坏段.push(`3封腔 ${键(s.id)} ${JSON.stringify(差3)} 不封闭 ${不封}`); }

  const g13 = 抄(g3), n13 = 埋格换石(g13);
  出('1+3', g13, 填.length + n13);
  const m13 = 建网格(环, 包, g13);
  if (网格全同(m3, m13)) 核['1+3'].对3封腔全同++; else { 核['1+3'].不同++; 坏段.push(`1+3 ${键(s.id)}`); }
  if (!网格全同(建网格(环, 包, g3, !(s.id.L >= 1)), 建网格(环, 包, g13, !(s.id.L >= 1)))) 核['1+3'].另一种树叶画法不同++;

  const g2 = 抄(g0), n2 = 按列定底(g2);
  出('2定底', g2, n2);
  if (网格全同(m0, 建网格(环, 包, g2))) 核['2定底'].对原样全同++; else 核['2定底'].对原样不同++;

  const g123 = 抄(g13), n123 = 按列定底(g123) + 埋格换石(g123);
  出('1+2+3', g123, 填.length + n13 + n123);
  const m123 = 建网格(环, 包, g123);
  if (网格全同(m13, m123)) 核['1+2+3'].对1加3全同++;
  else {
    核['1+2+3'].不同++;
    // 被定底多动的格分两类：确定露天的（非整格且从顶上漫得到，或整格且贴着这样的格）；其余只连到段边
    const 天 = 露天连通(g0, 0), { nz, cm, 满 } = g0, 行 = 边 * nz;
    let 确定 = 0, 段边 = 0;
    for (let at = 0; at < cm.length; at++) {
      if (g13.cm[at] === g123.cm[at]) continue;
      const k = at % nz;
      const 露 = 满[cm[at]!] ? (k > 0 && 天[at - 1]) || (k < nz - 1 && 天[at + 1]) || 天[at - nz] || 天[at + nz] || 天[at - 行] || 天[at + 行] : 天[at];
      if (露) 确定++; else 段边++;
    }
    const 差 = 比面(m13, m123, nz, new Uint8Array(cm.length));
    核['1+2+3'].少的面 += 差.少; 核['1+2+3'].多的面 += 差.多;
    if (确定) { 核['1+2+3'].动了确定露天的段++; 核['1+2+3'].动了确定露天的格 += 确定; } else 核['1+2+3'].只动连到段边的段++;
    核['1+2+3'].动了连到段边的格 += 段边;
    定底伤.push({ 段: 键(s.id), 确定露天格: 确定, 连到段边格: 段边, 少: 差.少, 多: 差.多 });
  }

  const u13 = 抄(g3), nu13 = 埋格换石(u13, 全窗口);
  出('上界1+3', u13, 填.length + nu13);
  const u123 = 抄(u13), nu123 = 按列定底(u123, 全窗口) + 埋格换石(u123, 全窗口);
  出('上界1+2+3', u123, 填.length + nu13 + nu123);
}
const 变换秒 = (performance.now() - 起) / 1000;

// 解码耗时：同 测地形.mjs 的口径，A/B/B/A 各解 8 遍整个集合，含 WASM、输入和结果拷贝，不含读盘
const 计时: Record<string, { 轮: { 谁: string; ms: number }[]; 比: [number, number] }> = {};
if (!参.includes('--不计时')) for (const 名 of ['1埋格', '1+3', '1+2+3'] as const) {
  const 轮: { 谁: string; ms: number }[] = [];
  for (const 谁 of ['A', 'B', 'B', 'A']) {
    const t = performance.now();
    let sum = 0;
    for (let rep = 0; rep < 8; rep++) 测.forEach((s, i) => { sum += 环.库.区段解码.解区段((谁 === 'A' ? 流.原样 : 流[名])[i]!, s.id, 包.模型).paletteIndex.length; });
    轮.push({ 谁, ms: performance.now() - t });
  }
  计时[名] = { 轮, 比: [轮[1]!.ms / 轮[0]!.ms, 轮[2]!.ms / 轮[3]!.ms] };
}

// 加权到全包：各 L 的样本比值 × 全包该 L 的区段字节（块索引里量的，不含块头、包.json、模型）
const 合计 = 零(), 样本字节 = 零();
for (const 名 of 方案) for (let L = 0; L < 7; L++) {
  样本字节[名] += 级[L]!.字节[名];
  if (级[L]!.段) 合计[名] += 全包级字节[L]! * 级[L]!.字节[名] / 级[L]!.字节.原样;
}
const 全包区段字节 = 全包级字节.reduce((a, b) => a + b, 0);
console.log(JSON.stringify({
  包: 包名, 集: 集文件 ?? '留出集', 段数: 测.length, 负载: os.loadavg(), 变换秒,
  全包: { 级字节: 全包级字节, 级段数: 全包级段数, 区段字节: 全包区段字节 },
  样本字节, 样本比: Object.fromEntries(方案.map((k) => [k, 样本字节[k] / 样本字节.原样])),
  加权估计比: 集文件 ? undefined : Object.fromEntries(方案.map((k) => [k, 合计[k] / 全包区段字节])),
  级: 级.map((x, L) => ({ L, ...x, 比: Object.fromEntries(方案.map((k) => [k, x.段 ? x.字节[k] / x.字节.原样 : null])) })),
  核, 坏段, 定底伤: 定底伤.sort((a, b) => b.确定露天格 - a.确定露天格).slice(0, 40), 计时,
}, null, 1));
