// 专挑露天峡谷、敞口大洞、悬崖下凹洞这类区段（用户 11-14 要验收重点看这类）：从上面看得见的深沟、洞口朝天或朝侧面敞开的洞、崖下的凹洞。
//   node wasm/实验/地形可见/找峡谷.ts <包名> <出：区段清单> > 明细.tsv
// 找法：粗高度图（16 米一格）里高差最大的 500 个第 0 级区段，加 700 个随机的，逐个解开量四个数，各取前 30 名并起来；再带上它们第 1～3 级的上级区段。
//   高差     核心各列地表（最高整格不透明格）的最高减最低
//   顶下露天 头顶有整格方块、又从本段最上一层往下六邻漫得到的非整格格数（洞口朝天或朝侧面敞在本段里的洞、崖下凹处）
//   矮口露天 其中所在那一竖段空当不到 16 格高的（烘焙的 浮空下地表 只认 16 格以上的空当，矮的最容易被按列定底截掉）
//   侧连     头顶有整格方块、本段里漫不到、只经段边连出去的非整格格数（只从侧面连通的洞，跨段判断出错伤的就是它）
import fs from 'node:fs';
import { 载入, 开包, 成格子, 键, terrain根, 边, type 区段项 } from './公共.ts';
import { 露天连通 } from './变换.ts';

const [包名, 出] = process.argv.slice(2) as [string, string];
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const 粗 = 环.库.区段包.decodeCoarseHeight(包.info);
const 粗高差 = (s: 区段项) => {
  let lo = Infinity, hi = -Infinity;
  const c0 = (s.id.i * 32 - 粗.x0) / 粗.格, r0 = (s.id.j * 32 - 粗.y0) / 粗.格;
  for (let r = r0 - 1; r <= r0 + 2; r++) for (let c = c0 - 1; c <= c0 + 2; c++) {
    if (r < 0 || c < 0 || r >= 粗.ny || c >= 粗.nx) continue;
    const h = 粗.高[r * 粗.nx + c]!;
    if (h === -32768) continue;
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return hi - lo;
};
const L0 = 包.级[0]!;
const 按高差 = L0.map((s) => ({ s, d: 粗高差(s) })).filter((x) => Number.isFinite(x.d)).sort((a, b) => b.d - a.d || (a.s.file < b.s.file ? -1 : 1) || a.s.off - b.s.off);
const 候选 = new Map<string, 区段项>(按高差.slice(0, 500).map((x) => [键(x.s.id), x.s]));
let seed = 20261114;
while (候选.size < 1200) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const s = L0[seed % L0.length]!; 候选.set(键(s.id), s); }

type 行 = { s: 区段项; 高差: number; 顶下露天: number; 矮口露天: number; 侧连: number };
const 行们: 行[] = [];
for (const s of 候选.values()) {
  const g = 成格子(包, 包.解(s)), { nz, cm, 满 } = g, 天 = 露天连通(g, 0), 开 = 露天连通(g, 2);
  let lo = Infinity, hi = -Infinity, 顶下露天 = 0, 矮口露天 = 0, 侧连 = 0;
  for (let y = 1; y < 边 - 1; y++) for (let x = 1; x < 边 - 1; x++) {
    const base = (y * 边 + x) * nz;
    let 顶 = nz - 1;
    while (顶 >= 0 && !满[cm[base + 顶]!]) 顶--;
    lo = Math.min(lo, 顶); hi = Math.max(hi, 顶);
    for (let k = 顶 - 1; k >= 0; k--) {
      if (满[cm[base + k]!]) continue;
      let 底 = k;
      while (底 > 0 && !满[cm[base + 底 - 1]!]) 底--;
      for (let t = 底; t <= k; t++) {
        if (天[base + t]) { 顶下露天++; if (k - 底 + 1 < 16) 矮口露天++; }
        else if (开[base + t]) 侧连++;
      }
      k = 底;
    }
  }
  行们.push({ s, 高差: hi - lo, 顶下露天, 矮口露天, 侧连 });
}
const 选 = new Map<string, { 行: 行; 因: string[] }>();
for (const 项 of ['高差', '顶下露天', '矮口露天', '侧连'] as const)
  for (const r of [...行们].sort((a, b) => b[项] - a[项]).slice(0, 30)) { const k = 键(r.s.id); 选.set(k, 选.get(k) ?? { 行: r, 因: [] }); 选.get(k)!.因.push(项); }
const 清单 = new Set(选.keys());
for (const { 行: r } of 选.values()) for (let L = 1; L <= 3; L++) { const k = 键({ L, i: r.s.id.i >> L, j: r.s.id.j >> L }); if (包.查.has(k)) 清单.add(k); }
fs.writeFileSync(出, [...清单].join('\n') + '\n');
// 区段 (0, i, j) 的游戏坐标：x = 32i + ox 起 32 格，z 到 oz − 32j 为止的 32 格（区段包.ts 文件头）
const [ox, oy, oz] = 包.info.原点;
console.log(['区段', '入选原因', '高差', '顶下露天', '矮口露天', '侧连', '游戏x', '游戏z', '最低存到y'].join('\t'));
for (const [k, { 行: r, 因 }] of [...选].sort((a, b) => b[1].行.顶下露天 - a[1].行.顶下露天))
  console.log([k, 因.join('+'), r.高差, r.顶下露天, r.矮口露天, r.侧连, `${r.s.id.i * 32 + ox}～${r.s.id.i * 32 + ox + 31}`, `${oz - r.s.id.j * 32 - 32}～${oz - r.s.id.j * 32 - 1}`, 包.解(r.s).kBottom + oy].join('\t'));
console.error(`${包名}：候选 ${候选.size} 个第 0 级区段，入选 ${选.size} 个，连上级共 ${清单.size} 个`);
