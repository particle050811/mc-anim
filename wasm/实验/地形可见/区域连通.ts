// 跨区段的连通判断做精确了还能多省多少（只估计，不核对网格）：把第 0 级 n×n 个区段拼成一片，在整片上找和露天连通的非整格，
// 片里漫不到的才算封死。比「每个区段自己判断、碰到段边就当连通」多填的，就是只连到段边、其实封死的洞。
//   node wasm/实验/地形可见/区域连通.ts <包名> [--片 <几片，默认 10>] [--边 <每边几个区段，默认 6>] [--保真 <清单>] > 结果.json
// 片的最外一圈区段不量（片边照旧当连通，圈里的偏保守）。量的区段：整片判断填完（裙边那几列也填，两个区段的抄本自然一致）再做留裙边的埋格换石，
// 和每段自己做 3、1 的字节比。真这样做网格不再是「只少不改」：填到核心边上的格会多出裙边面，都在封死的地下。
import fs from 'node:fs';
import { 载入, 开包, 留出集, 成格子, 抄, 成区段, 压, 键, terrain根, 边, type 格子 } from './公共.ts';
import { 埋格换石, 填封闭腔, 露天连通 } from './变换.ts';

const 参 = process.argv.slice(2), 包名 = 参[0]!;
const 取参 = (名: string) => { const i = 参.indexOf(名); return i < 0 ? undefined : 参[i + 1]; };
const 片数 = Number(取参('--片') ?? 10), n = Number(取参('--边') ?? 6);
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const 保真文件 = 取参('--保真'), 保真 = new Set(保真文件 ? fs.readFileSync(保真文件, 'utf8').split('\n').filter(Boolean) : []);
const 合 = { 片: 0, 段: 0, 原样: 0, 每段自己: 0, 整片判断: 0, 每段填的格: 0, 整片填的格: 0, 其中裙边列的格: 0 };
for (const s of 留出集(包).测) {
  if (s.id.L !== 0 || 合.片 >= 片数) continue;
  const 项 = Array.from({ length: n * n }, (_, t) => 包.查.get(键({ L: 0, i: s.id.i + (t % n), j: s.id.j + Math.floor(t / n) })));
  if (项.some((x) => !x || 保真.has(键(x.id)))) continue;
  const 段 = 项.map((x) => 成格子(包, 包.解(x!)));
  const kb = Math.min(...段.map((g) => g.kBottom)), nz = Math.max(...段.map((g) => g.kBottom + g.nz)) - kb, W = 32 * n + 2;
  // 整片只要不透明性：1 = 整格不透明（各段 k底 以下按网格的规矩当实心），0 = 其余
  const cm = new Uint16Array(W * W * nz);
  for (let Y = 0; Y < W; Y++) for (let X = 0; X < W; X++) {
    const a = Math.min(n - 1, Math.max(0, Math.floor((X - 1) / 32))), b = Math.min(n - 1, Math.max(0, Math.floor((Y - 1) / 32))), g = 段[b * n + a]!;
    const 源 = ((Y - 32 * b) * 边 + X - 32 * a) * g.nz, 目 = (Y * W + X) * nz, 垫 = g.kBottom - kb;
    cm.fill(1, 目, 目 + 垫);
    for (let k = 0; k < g.nz; k++) cm[目 + 垫 + k] = g.满[g.cm[源 + k]!]!;
  }
  const 开 = 露天连通({ id: s.id, kBottom: kb, nz, cm, 色板: [], 满: Uint8Array.of(0, 1), 石: 1, 宽: W }, 2);
  合.片++;
  for (let b = 1; b < n - 1; b++) for (let a = 1; a < n - 1; a++) {
    const g0 = 段[b * n + a]!, 自 = 抄(g0), 整 = 抄(g0), 垫 = g0.kBottom - kb;
    合.每段填的格 += 填封闭腔(自).length; 埋格换石(自);
    for (let y = 0; y < 边; y++) for (let x = 0; x < 边; x++) for (let k = 0; k < g0.nz; k++) {
      const at = (y * 边 + x) * g0.nz + k;
      if (g0.满[g0.cm[at]!] || 开[((32 * b + y) * W + 32 * a + x) * nz + 垫 + k]) continue;
      整.cm[at] = g0.石; 合.整片填的格++;
      if (x < 2 || y < 2 || x > 边 - 3 || y > 边 - 3) 合.其中裙边列的格++;
    }
    埋格换石(整);
    合.段++; 合.原样 += 项[b * n + a]!.len;
    合.每段自己 += 压(环, 成区段(自), 包.模型).length; 合.整片判断 += 压(环, 成区段(整), 包.模型).length;
  }
}
console.log(JSON.stringify({ 包: 包名, 每边区段: n, ...合, 每段自己比原样: 合.每段自己 / 合.原样, 整片判断比原样: 合.整片判断 / 合.原样, 整片比每段: 合.整片判断 / 合.每段自己 }, null, 1));
