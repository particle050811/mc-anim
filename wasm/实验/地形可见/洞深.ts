// 只估潜力，不是验收过的变换：照原样的按列定底比 1+3 多省的那一截，被动的格绝大多数是「连着地表、但离地表很远的洞穴网」里的空气。
// 这里量一条按深度截的规则能拿回多少：从露天格（头顶再没有整格不透明的非整格）起，穿过非整格走六邻，走过 T 米还到不了的非整格填石头。
//   node wasm/实验/地形可见/洞深.ts <包名> [--级 <L，默认 0>] [--集 <清单>] [--片 <最多几片，默认 12>] [--深 <T,T…，米，默认 128,64,32>] [--保真 <清单>] > 结果.json
// 同一级的区段拼成一片：片边的非整格当露天，所以四周留 ⌈最大 T / 一个区段的米数⌉ 个区段，片边影响不到正中的 4×4 个区段（第 0 级 T = 128 时一片 12×12 个区段）。
// 粗级各级自己按米数截（T 米 = T / 2^L 格），只为估全包；真做应该在第 0 级截完再一级级合并。
// 不给 --集：从留出集的这一级取片，量正中 16 段。给 --集（峡谷集）：清单里这一级的每个区段各拼一片，只量它自己。
// 「直线到片边」多是很深的大洞厅（主世界常见一百多格宽的），在片里够不着露天，片外不知道，不算误伤。
// 它会改网格：截断处多出一堵石墙、更深的洞壁没了。露天格和 T 米以内的一格不动；直着看进去超过 T/√3 米才可能看到变化。
// 「直线到得了露天」= 被填的格沿 26 个方向直着走、不撞整格就能走到露天格的：从露天那一头直着能看到它，是这条规则会误伤的地方。
import fs from 'node:fs';
import { 载入, 开包, 留出集, 成格子, 抄, 成区段, 压, 键, terrain根, 边, type 格子, type 区段项 } from './公共.ts';
import { 埋格换石, 填封闭腔, 按列定底, 邻圈归一, 核心边换石 } from './变换.ts';
import { 建网格 } from './核对.ts';

const 参 = process.argv.slice(2), 包名 = 参[0]!;
const 取参 = (名: string) => { const i = 参.indexOf(名); return i < 0 ? undefined : 参[i + 1]; };
const 片数 = Number(取参('--片') ?? 12), L = Number(取参('--级') ?? 0), 深们 = (取参('--深') ?? '128,64,32').split(',').map(Number);
const 格数 = (T: number) => Math.round(T / 2 ** L), 圈 = Math.ceil(格数(Math.max(...深们)) / 32), n = 2 * 圈 + 4;
if (格数(Math.max(...深们)) > 254) throw new Error('步数只记到 254');
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const 保真文件 = 取参('--保真'), 保真 = new Set(保真文件 ? fs.readFileSync(保真文件, 'utf8').split('\n').filter(Boolean) : []);
const 集 = 取参('--集');
const 锚: 区段项[] = (集 ? fs.readFileSync(集, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)[0]!).filter(Boolean).map((k) => 包.查.get(k)!) : 留出集(包).测).filter((s) => s.id.L === L);
const 名们 = ['1+3', '1+2+3照原样定底', '最终', ...深们.flatMap((T) => [`洞深${T}`, `最终+洞深${T}`])];
const 零 = () => Object.fromEntries(名们.map((k) => [k, 0]));
const 合 = { 片: 0, 段: 0, 原样字节: 0, 原样面: 0, 原样实心面: 0, 字节: 零(), 面: 零(), 实心面: 零(), 洞深: Object.fromEntries(深们.map((T) => [T, { 填的格: 0, 其中直线到得了露天: 0, 其中直线到片边: 0, 有这种格的段: 0 }])) };
const 向: number[][] = [];
for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) 向.push([dx, dy, dz]);
const 归空表 = (g: 格子) => Uint8Array.from({ length: g.色板.length / 2 }, (_, p) => (p && 包.状态罩[g.色板[2 * p]!] === 0 ? 1 : 0));
/** 最终的做法里不靠整片判断的那几步：埋格、邻圈只换被埋的并归空、核心边 */
const 收尾 = (g: 格子) => { 埋格换石(g); 邻圈归一(g, true, 归空表(g)); if (L === 0) 核心边换石(g, [true, true, true, true]); return g; };

for (const s of 锚) {
  if (合.片 >= 片数) break;
  const 项 = Array.from({ length: n * n }, (_, t) => 包.查.get(键({ L, i: s.id.i - 圈 + (t % n), j: s.id.j - 圈 + Math.floor(t / n) })));
  if (项.some((x) => !x || 保真.has(键(x.id)))) continue;
  const 段 = 项.map((x) => 成格子(包, 包.解(x!)));
  const kb = Math.min(...段.map((g) => g.kBottom)), nz = Math.max(...段.map((g) => g.kBottom + g.nz)) - kb, W = 32 * n + 2, 行 = W * nz;
  // 整片的不透明性（各段 k底 以下按网格的规矩当实心）、到露天的步数（255 = 走不到或超过 254 步）、是不是露天格
  const 实 = new Uint8Array(W * W * nz), 步 = new Uint8Array(W * W * nz).fill(255), 天 = new Uint8Array(W * W * nz), 队 = new Int32Array(W * W * nz);
  let 头 = 0, 尾 = 0;
  for (let Y = 0; Y < W; Y++) for (let X = 0; X < W; X++) {
    const a = Math.min(n - 1, Math.max(0, Math.floor((X - 1) / 32))), b = Math.min(n - 1, Math.max(0, Math.floor((Y - 1) / 32))), g = 段[b * n + a]!;
    const 源 = ((Y - 32 * b) * 边 + X - 32 * a) * g.nz, 目 = (Y * W + X) * nz, 垫 = g.kBottom - kb;
    实.fill(1, 目, 目 + 垫);
    for (let k = 0; k < g.nz; k++) 实[目 + 垫 + k] = g.满[g.cm[源 + k]!]!;
    const 片边 = X < 2 || Y < 2 || X >= W - 2 || Y >= W - 2;
    let 露 = true;
    for (let k = nz - 1; k >= 0; k--) {
      if (实[目 + k]) { 露 = false; continue; }
      if (露) 天[目 + k] = 1;
      if (露 || 片边) { 步[目 + k] = 0; 队[尾++] = 目 + k; }
    }
  }
  while (头 < 尾) {
    const at = 队[头++]!, d = 步[at]! + 1, c = Math.floor(at / nz), k = at - c * nz, X = c % W, Y = (c - X) / W;
    if (d > 254) continue;
    const 进 = (to: number) => { if (!实[to] && 步[to] === 255) { 步[to] = d; 队[尾++] = to; } };
    if (k > 0) 进(at - 1);
    if (k < nz - 1) 进(at + 1);
    if (X > 0) 进(at - nz);
    if (X < W - 1) 进(at + nz);
    if (Y > 0) 进(at - 行);
    if (Y < W - 1) 进(at + 行);
  }
  /** 从整片的 (X, Y, k) 沿 26 个方向直着走：1 = 走到露天格，2 = 没撞整格走出了片，0 = 都撞了 */
  const 看 = (X0: number, Y0: number, k0: number) => {
    let 出片 = 0;
    for (const [dx, dy, dz] of 向) for (let X = X0 + dx!, Y = Y0 + dy!, k = k0 + dz!; ; X += dx!, Y += dy!, k += dz!) {
      if (k >= nz) return 1;
      if (X < 0 || Y < 0 || X >= W || Y >= W) { 出片 = 2; break; }
      const at = (Y * W + X) * nz + k;
      if (k < 0 || 实[at]) break;
      if (天[at]) return 1;
    }
    return 出片;
  };
  合.片++;
  for (let b = 圈; b < (集 ? 圈 + 1 : 圈 + 4); b++) for (let a = 圈; a < (集 ? 圈 + 1 : 圈 + 4); a++) {
    const g0 = 段[b * n + a]!, 垫 = g0.kBottom - kb, m0 = 建网格(环, 包, g0);
    const 记 = (名: string, g: 格子) => { const m = 建网格(环, 包, g); 合.字节[名]! += 压(环, 成区段(g), 包.模型).length; 合.面[名]! += m.面数; 合.实心面[名]! += m.实心.n; };
    合.段++; 合.原样字节 += 项[b * n + a]!.len; 合.原样面 += m0.面数; 合.原样实心面 += m0.实心.n;
    const g13 = 抄(g0);
    填封闭腔(g13); 埋格换石(g13);
    记('1+3', g13);
    const g123 = 抄(g13);
    按列定底(g123); 埋格换石(g123);
    记('1+2+3照原样定底', g123);
    记('最终', 收尾(抄(g13)));
    for (const T of 深们) {
      const g = 抄(g0), st = 合.洞深[T]!;
      let 伤 = 0;
      for (let y = 0; y < 边; y++) for (let x = 0; x < 边; x++) for (let k = 0; k < g0.nz; k++) {
        const at = (y * 边 + x) * g0.nz + k, X = 32 * a + x, Y = 32 * b + y;
        if (g0.满[g0.cm[at]!] || 步[(Y * W + X) * nz + 垫 + k]! <= 格数(T)) continue;
        g.cm[at] = g0.石;
        if (x < 1 || y < 1 || x > 边 - 2 || y > 边 - 2) continue; // 邻圈的格算在邻段头上
        st.填的格++;
        const r = 看(X, Y, 垫 + k);
        if (r === 1) { st.其中直线到得了露天++; 伤++; } else if (r === 2) st.其中直线到片边++;
      }
      if (伤) st.有这种格的段++;
      埋格换石(g);
      记(`洞深${T}`, g);
      记(`最终+洞深${T}`, 收尾(g));
    }
  }
}
const 比 = (x: Record<string, number>, 底: number) => Object.fromEntries(名们.map((k) => [k, x[k]! / 底]));
console.log(JSON.stringify({
  包: 包名, 级: L, 集: 集 ?? '留出集', 每边区段: n, 四周留几个区段: 圈, ...合,
  字节比原样: 比(合.字节, 合.原样字节), 面比原样: 比(合.面, 合.原样面), 实心面比原样: 比(合.实心面, 合.原样实心面),
}, null, 1));
