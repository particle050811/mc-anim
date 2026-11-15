// 专挑露天峡谷、敞口大洞、悬崖下凹洞这类区段（用户 11-14 要验收重点看这类）：从上面看得见的深沟、洞口朝天或朝侧面敞开的洞、崖下的凹洞。
//   node wasm/实验/地形可见/找峡谷.ts <包名> <出：区段清单> > 明细.tsv
// 找法：粗高度图（16 米一格）里高差最大的 500 个第 0 级区段，加 700 个随机的，逐个解开量四个数，各取前 30 名并起来；再带上它们第 1～3 级的上级区段。
//   高差     核心各列地表（最高整格不透明格）的最高减最低
//   顶下露天 头顶有整格方块、又从本段最上一层往下六邻漫得到的非整格格数（洞口朝天或朝侧面敞在本段里的洞、崖下凹处）
//   矮口露天 其中所在那一竖段空当不到 16 格高的（烘焙的 浮空下地表 只认 16 格以上的空当，矮的最容易被按列定底截掉）
//   侧连     头顶有整格方块、本段里漫不到、只经段边连出去的非整格格数（只从侧面连通的洞，跨段判断出错伤的就是它）
import fs from 'node:fs';
import { load, openPack, makeCellGrid, sectionKey, terrainRoot, sectionSide, type SectionItem } from './公共.ts';
import { openAirConnected } from '../../../pipeline/世界/烘焙/可见.ts';

const [packName, outFile] = process.argv.slice(2) as [string, string];
const env = await load(), pack = openPack(env, terrainRoot(), packName);
const coarse = env.库.sectionPack.decodeCoarseHeight(pack.info);
const coarseHeightDiff = (s: SectionItem) => {
  let lo = Infinity, hi = -Infinity;
  const c0 = (s.id.i * 32 - coarse.x0) / coarse.格, r0 = (s.id.j * 32 - coarse.y0) / coarse.格;
  for (let r = r0 - 1; r <= r0 + 2; r++) for (let c = c0 - 1; c <= c0 + 2; c++) {
    if (r < 0 || c < 0 || r >= coarse.ny || c >= coarse.nx) continue;
    const h = coarse.高[r * coarse.nx + c]!;
    if (h === -32768) continue;
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return hi - lo;
};
const L0 = pack.级[0]!;
const sortedByHeight = L0.map((s) => ({ s, d: coarseHeightDiff(s) })).filter((x) => Number.isFinite(x.d)).sort((a, b) => b.d - a.d || (a.s.file < b.s.file ? -1 : 1) || a.s.off - b.s.off);
const candidates = new Map<string, SectionItem>(sortedByHeight.slice(0, 500).map((x) => [sectionKey(x.s.id), x.s]));
let seed = 20261114;
while (candidates.size < 1200) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const s = L0[seed % L0.length]!; candidates.set(sectionKey(s.id), s); }

type Row = { s: SectionItem; 高差: number; 顶下露天: number; 矮口露天: number; 侧连: number };
const rows: Row[] = [];
for (const s of candidates.values()) {
  const g = makeCellGrid(pack, pack.decodeSection(s)), { nz, cm, fullMask: full } = g, skyConnected = openAirConnected(g, 0), openConnected = openAirConnected(g, 2);
  let lo = Infinity, hi = -Infinity, underTopExposed = 0, lowMouthExposed = 0, sideConnected = 0;
  for (let y = 1; y < sectionSide - 1; y++) for (let x = 1; x < sectionSide - 1; x++) {
    const base = (y * sectionSide + x) * nz;
    let topIdx = nz - 1;
    while (topIdx >= 0 && !full[cm[base + topIdx]!]) topIdx--;
    lo = Math.min(lo, topIdx); hi = Math.max(hi, topIdx);
    for (let k = topIdx - 1; k >= 0; k--) {
      if (full[cm[base + k]!]) continue;
      let bottomY = k;
      while (bottomY > 0 && !full[cm[base + bottomY - 1]!]) bottomY--;
      for (let t = bottomY; t <= k; t++) {
        if (skyConnected[base + t]) { underTopExposed++; if (k - bottomY + 1 < 16) lowMouthExposed++; }
        else if (openConnected[base + t]) sideConnected++;
      }
      k = bottomY;
    }
  }
  rows.push({ s, 高差: hi - lo, 顶下露天: underTopExposed, 矮口露天: lowMouthExposed, 侧连: sideConnected });
}
const chosen = new Map<string, { 行: Row; reasons: string[] }>();
for (const item of ['高差', '顶下露天', '矮口露天', '侧连'] as const)
  for (const r of [...rows].sort((a, b) => b[item] - a[item]).slice(0, 30)) { const k = sectionKey(r.s.id); chosen.set(k, chosen.get(k) ?? { 行: r, reasons: [] }); chosen.get(k)!.reasons.push(item); }
const keySet = new Set(chosen.keys());
for (const { 行: r } of chosen.values()) for (let L = 1; L <= 3; L++) { const k = sectionKey({ L, i: r.s.id.i >> L, j: r.s.id.j >> L }); if (pack.lookup.has(k)) keySet.add(k); }
fs.writeFileSync(outFile, [...keySet].join('\n') + '\n');
// 区段 (0, i, j) 的游戏坐标：x = 32i + ox 起 32 格，z 到 oz − 32j 为止的 32 格（区段包.ts 文件头）
const [ox, oy, oz] = pack.info.原点;
console.log(['区段', '入选原因', '高差', '顶下露天', '矮口露天', '侧连', '游戏x', '游戏z', '最低存到y'].join('\t'));
for (const [k, { 行: r, reasons }] of [...chosen].sort((a, b) => b[1].行.顶下露天 - a[1].行.顶下露天))
  console.log([k, reasons.join('+'), r.高差, r.顶下露天, r.矮口露天, r.侧连, `${r.s.id.i * 32 + ox}～${r.s.id.i * 32 + ox + 31}`, `${oz - r.s.id.j * 32 - 32}～${oz - r.s.id.j * 32 - 1}`, pack.decodeSection(r.s).kBottom + oy].join('\t'));
console.error(`${packName}：候选 ${candidates.size} 个第 0 级区段，入选 ${chosen.size} 个，连上级共 ${keySet.size} 个`);
