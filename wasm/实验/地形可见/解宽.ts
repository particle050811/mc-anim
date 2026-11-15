// 64×64 的解码耗时：把 wasm/区段解码.ts 的每边列数改成 66 另编一份 WASM（只放内存里，不写生成文件、不升格式），
// 解拼出来的 66×66 列大区段，和现行解码器解那四个 34×34 列小区段比。口径同 量.ts：A/B/B/A 各解 8 遍，含 WASM、输入和结果拷贝，不含读盘。
//   node wasm/实验/地形可见/解宽.ts <包名> [--每级 <最多几组，默认 40>] [--保真 <清单>] > 结果.json
// 组的挑法、拼法同 拼大.ts。大区段解回来的格子逐格和拼出来的比，一样才计时。体积顺带量「最终的做法」下四个小的对一个大的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { 代码根 } from '../../../pipeline/环境/路径.ts';
import { 压区段 } from '../../../pipeline/世界/烘焙/区段编码.ts';
import type { 区段模型 } from '../../../engine/voxel/区段模型.ts';
import { 载入, 开包, 留出集, 成格子, 抄, 成区段, 键, terrain根, type 格子, type 区段项, type 区段号 } from './公共.ts';
import { 埋格换石, 填封闭腔, 邻圈归一, 核心边换石 } from '../../../pipeline/世界/烘焙/可见.ts';
import { 压宽, 排色板, 拼, 大 } from './宽编码.ts';

/** 同 pipeline/世界/区段解码器.ts 的 asc参数（那边没导出；优化选项进 WASM 字节，两边不一样就不是同一种解码器） */
const asc参数 = ['--optimizeLevel', '3', '--shrinkLevel', '0', '--noAssert', '--runtime', 'stub', '--use', 'abort=', '--initialMemory', '8', '--converge'];
const 编宽解码器 = (宽: number) => {
  const 源 = fs.readFileSync(path.join(代码根(), 'wasm', '区段解码.ts'), 'utf8'), 旧 = 'const 边: i32 = 34,';
  if (!源.includes(旧)) throw new Error('wasm/区段解码.ts 里每边列数的写法变了');
  const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), '宽解码器-'));
  try {
    fs.writeFileSync(path.join(目录, 'x.ts'), 源.replace(旧, `const 边: i32 = ${宽},`));
    execFileSync(process.execPath, [path.join(代码根(), 'node_modules', 'assemblyscript', 'bin', 'asc.js'), path.join(目录, 'x.ts'), '-o', path.join(目录, 'x.wasm'), ...asc参数], { cwd: 代码根(), stdio: ['ignore', 'pipe', 'pipe'] });
    return fs.readFileSync(path.join(目录, 'x.wasm'));
  } finally { fs.rmSync(目录, { recursive: true, force: true }); }
};
type 解函数 = (入: number, 入长: number, 表: number, 工: number, 树: number, cm: number, 跑: number, 数: number, 号: number, 长: number, nz: number, 色板项: number, L: number, pal: number, map: number, weights: number, scratch: number, classes: number, stride: number) => number;
/** 照 engine/voxel/区段解码.ts 的 创建 排内存，列数换成 宽² */
const 建宽解码 = (wasm: Uint8Array, m: 区段模型, 宽: number) => {
  const 列数 = 宽 * 宽, { 解, memory } = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(wasm))).exports as { 解: 解函数; memory: WebAssembly.Memory };
  const align = (x: number) => (x + 7) & ~7;
  const T = 65536, W = align(T + m.init.byteLength), M = align(W + m.init.byteLength), F = align(M + 65536), D = align(F + m.weights.byteLength);
  const grow = (end: number) => { if (memory.buffer.byteLength < end) memory.grow(Math.ceil((end - memory.buffer.byteLength) / 65536)); };
  grow(D);
  new Uint16Array(memory.buffer, T, m.init.length).set(m.init);
  new Uint8Array(memory.buffer, M, 65536).set(m.map);
  new Uint16Array(memory.buffer, F, m.weights.length).set(m.weights);
  return (raw: Uint8Array, L: number) => {
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), nz = dv.getUint16(0, true), kBottom = dv.getInt16(2, true), P = dv.getUint16(4, true);
    const h = 6 + P * 4, len = raw.length - h, n = 1 << Math.max(1, Math.ceil(Math.log2(P))), tree = D, scratch = tree + m.classes * n * 2;
    const input = align(scratch + 8 * n + P), cm = align(input + raw.length + 16), runs = cm + 2 * nz * 列数, counts = runs + 2 * nz * 列数, values = counts + 2 * 列数, lengths = values + 2 * nz * 列数;
    grow(lengths + 2 * nz * 列数);
    const mem = new Uint8Array(memory.buffer);
    mem.set(raw, input);
    mem.fill(0, input + raw.length, input + raw.length + 16);
    const R = 解(input + h, len, T, W, tree, cm, runs, counts, values, lengths, nz, P, L, input + 6, M, F, scratch, m.classes, m.stride);
    if (R < 0) throw new Error('宽区段的编码流没有正好读完');
    const ab = new ArrayBuffer((2 * P + 列数 + 2 * R) * 2), palette = new Uint16Array(ab, 0, 2 * P), runCounts = new Uint16Array(ab, 4 * P, 列数), paletteIndex = new Uint16Array(ab, 4 * P + 2 * 列数, R), runLengths = new Uint16Array(ab, 4 * P + 2 * 列数 + 2 * R, R);
    new Uint8Array(ab, 0, 4 * P).set(raw.subarray(6, h));
    runCounts.set(new Uint16Array(memory.buffer, counts, 列数));
    paletteIndex.set(new Uint16Array(memory.buffer, values, R));
    runLengths.set(new Uint16Array(memory.buffer, lengths, R));
    return { kBottom, nz, palette, runCounts, paletteIndex, runLengths, 格: () => new Uint16Array(memory.buffer, cm, nz * 列数) };
  };
};

const 参 = process.argv.slice(2), 包名 = 参[0]!;
const 取参 = (名: string) => { const i = 参.indexOf(名); return i < 0 ? undefined : 参[i + 1]; };
const 每级 = Number(取参('--每级') ?? 40);
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const 保真文件 = 取参('--保真'), 保真 = new Set(保真文件 ? fs.readFileSync(保真文件, 'utf8').split('\n').filter(Boolean) : []);
const wasm = 编宽解码器(大), 解宽 = 建宽解码(wasm, 包.模型, 大);
type 组 = { L: number; 小: { raw: Uint8Array; id: 区段号 }[]; 大: Uint8Array };
const 原样: 组[] = [], 做后: 组[] = [], 见 = new Set<string>();
const 列 = ['四个原样', '拼原样', '四个最终', '一个大的最终'] as const;
const 统 = Array.from({ length: 7 }, () => ({ 组: 0, ...(Object.fromEntries(列.map((k) => [k, 0])) as Record<(typeof 列)[number], number>) }));
/** 最终的做法（定底裙边.ts 量出来的）：3 封腔、1 埋格、邻圈只换被埋的并归空，第 0 级再加核心边。窗口 34 列、66 列都能用 */
const 全做 = (g: 格子, 有邻: boolean[]) => {
  填封闭腔(g); 埋格换石(g);
  邻圈归一(g, Uint8Array.from({ length: g.色板.length / 2 }, (_, p) => (p && 包.状态罩[g.色板[2 * p]!] === 0 ? 1 : 0)));
  if (g.id.L === 0) 核心边换石(g, 有邻);
  return g;
};
for (const s of 留出集(包).测) {
  const { L } = s.id, a = s.id.i >> 1, b = s.id.j >> 1, 组键 = `${L}/${a}/${b}`, st = 统[L]!;
  if (见.has(组键) || st.组 >= 每级) continue;
  见.add(组键);
  const 项 = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([di, dj]) => 包.查.get(键({ L, i: 2 * a + di!, j: 2 * b + dj! })));
  if (项.some((x) => !x || 保真.has(键(x.id)))) continue;
  st.组++;
  const 原 = (项 as 区段项[]).map((x) => 成格子(包, 包.解(x)));
  const 侧 = (i: number, j: number, 步: number) => [[步, 0], [-步, 0], [0, 步], [0, -步]].map(([di, dj]) => 包.查.has(键({ L, i: i + di!, j: j + dj! })));
  const 压并核 = (g: ReturnType<typeof 拼>) => {
    const 排 = 排色板(g), raw = 压宽(排, L, 包.模型), 回 = 解宽(raw, L), 格 = 回.格();
    if (回.nz !== 排.nz || 回.kBottom !== 排.kBottom || Buffer.compare(Buffer.from(格.buffer, 格.byteOffset, 格.byteLength), Buffer.from(排.cm.buffer, 排.cm.byteOffset, 排.cm.byteLength))) throw new Error(`宽区段 ${组键} 解回来不一样`);
    return raw;
  };
  const 大原 = 压并核(拼(原, 包.石状态, 包.状态满));
  // 大的：四个小的先各自封腔、埋格（邻圈、核心边先不动，拼的时候中间那两列要用），拼好再在 66 列的窗口上全做一遍；大区段四周的邻段按 2 个小区段外有没有算
  const 大后 = 压并核(全做(拼(原.map((g) => { const h = 抄(g); 填封闭腔(h); 埋格换石(h); return h; }), 包.石状态, 包.状态满), [包.查.has(键({ L, i: 2 * a + 2, j: 2 * b })), 包.查.has(键({ L, i: 2 * a - 1, j: 2 * b })), 包.查.has(键({ L, i: 2 * a, j: 2 * b + 2 })), 包.查.has(键({ L, i: 2 * a, j: 2 * b - 1 }))]));
  const 小后 = 原.map((g) => ({ raw: 压区段(成区段(全做(抄(g), 侧(g.id.i, g.id.j, 1))), 包.模型), id: g.id }));
  原样.push({ L, 小: (项 as 区段项[]).map((x) => ({ raw: 包.读(x), id: x.id })), 大: 大原 });
  做后.push({ L, 小: 小后, 大: 大后 });
  st.四个原样 += (项 as 区段项[]).reduce((n, x) => n + x.len, 0); st.拼原样 += 大原.length;
  st.四个最终 += 小后.reduce((n, x) => n + x.raw.length, 0); st.一个大的最终 += 大后.length;
}
const 全包级字节 = 包.级.map((b) => b.reduce((n, x) => n + x.len, 0)), 合 = Object.fromEntries(列.map((k) => [k, 0])) as Record<(typeof 列)[number], number>;
let 权 = 0;
for (let L = 0; L < 7; L++) if (统[L]!.组) { 权 += 全包级字节[L]!; for (const k of 列) 合[k] += 全包级字节[L]! * 统[L]![k] / 统[L]!.四个原样; }
const 计时 = (组们: 组[]) => {
  const 轮: { 谁: string; ms: number }[] = [];
  for (const 谁 of ['四个小的', '一个大的', '一个大的', '四个小的']) {
    const t = performance.now();
    for (let rep = 0; rep < 8; rep++) for (const g of 组们) {
      if (谁 === '四个小的') for (const x of g.小) 环.库.区段解码.解区段(x.raw, x.id, 包.模型);
      else 解宽(g.大, g.L);
    }
    轮.push({ 谁, ms: performance.now() - t });
  }
  return { 组: 组们.length, 轮, 大比小: [轮[1]!.ms / 轮[0]!.ms, 轮[2]!.ms / 轮[3]!.ms], 四个小的每组毫秒: (轮[0]!.ms + 轮[3]!.ms) / 16 / 组们.length, 一个大的每组毫秒: (轮[1]!.ms + 轮[2]!.ms) / 16 / 组们.length };
};
const 交叉 = (() => { const a = 计时(原样).轮, b = 计时(做后).轮; return { 四个小的原样ms: (a[0]!.ms + a[3]!.ms) / 2, 四个小的最终ms: (b[0]!.ms + b[3]!.ms) / 2, 一个大的最终ms: (b[1]!.ms + b[2]!.ms) / 2 }; })();
console.log(JSON.stringify({
  包: 包名, 每级, 负载: os.loadavg(), 宽解码器字节: wasm.length,
  级: 统.map((x, L) => ({ L, ...x, 大比小_原样: x.组 ? x.拼原样 / x.四个原样 : null, 大比小_最终: x.组 ? x.一个大的最终 / x.四个最终 : null })),
  // 各级样本比 × 全包该级区段字节；没有成组样本的级不算进分母
  加权估计_对现行格式: Object.fromEntries(列.map((k) => [k, 合[k] / 权])), 加权覆盖的字节占比: 权 / 全包级字节.reduce((a, b) => a + b, 0),
  解码: { 原样: { 全部: 计时(原样), 第0级: 计时(原样.filter((g) => g.L === 0)) }, 最终: { 全部: 计时(做后), 第0级: 计时(做后.filter((g) => g.L === 0)) }, 现行对最终: { ...交叉, 小的最终比现行: 交叉.四个小的最终ms / 交叉.四个小的原样ms, 大的最终比现行: 交叉.一个大的最终ms / 交叉.四个小的原样ms } },
}, null, 1));
