// 变换 4：把相邻 2×2 个区段拼成一个 64×64 的区段（带一圈相邻格是 66×66 列）再编码，只量体积，不改格式；解码耗时在 解宽.ts 量。
//   node wasm/实验/地形可见/拼大.ts <包名> [--每级 <最多几组，默认 40>] [--保真 <清单>] > 结果.json
// 组从留出集里挑：留出的区段所在的 2×2（i>>1、j>>1），四个都在包里、都不在保真清单里才算。
// 拼法：每列取它是核心的那个区段的抄本；四个区段各自的 k底 不一样，拼出来从最低的 k底 起，各列自己 k底 以下填石头（现在本来就不存、当实心）、顶上填空气。
//   真烘 64×64 时这一截存的是真方块（多半也是埋住的），所以这里略偏乐观。
// 「拼后再做」= 在 66 列的窗口上再做一遍 3、1：原来四个区段之间的边不再是核心的边，裙边那两列也能动了。
// 编码器在 宽编码.ts（每边列数做成参数）；每组先用 34 列压一个原区段，和正式编码器逐字节相同才往下算。
import fs from 'node:fs';
import { encodeSection } from '../../../pipeline/世界/烘焙/区段编码.ts';
import { load, openPack, holdoutSplit, makeCellGrid, copyGrid, makeSection, sectionKey, terrainRoot, sectionSide, type SectionItem } from './公共.ts';
import { replaceBuriedWithStone, fillSealedCavity } from '../../../pipeline/世界/烘焙/可见.ts';
import { compressWidth, arrangePalette, combineQuad } from './宽编码.ts';

const cliParams = process.argv.slice(2), packName = cliParams[0]!;
const getArg = (flagName: string) => { const i = cliParams.indexOf(flagName); return i < 0 ? undefined : cliParams[i + 1]; };
const perLevel = Number(getArg('--每级') ?? 40);
const env = await load(), pack = openPack(env, terrainRoot(), packName);
const fullLevelBytes = pack.级.map((b) => b.reduce((s, x) => s + x.len, 0));
const fidelityFile = getArg('--保真'), faithfulSet = new Set(fidelityFile ? fs.readFileSync(fidelityFile, 'utf8').split('\n').filter(Boolean) : []);
const colNames = ['四个原样', '拼原样', '四个1+3', '拼1+3', '拼后再做1+3'] as const;
const levelStats = Array.from({ length: 7 }, () => ({ 组: 0, ...(Object.fromEntries(colNames.map((k) => [k, 0])) as Record<(typeof colNames)[number], number>) }));
const seen = new Set<string>();
let copyMismatch = 0;
for (const s of holdoutSplit(pack).测) {
  const { L } = s.id, a = s.id.i >> 1, b = s.id.j >> 1, groupKey = `${L}/${a}/${b}`, st = levelStats[L]!;
  if (seen.has(groupKey) || st.组 >= perLevel) continue;
  seen.add(groupKey);
  const items = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([di, dj]) => pack.lookup.get(sectionKey({ L, i: 2 * a + di!, j: 2 * b + dj! })));
  if (items.some((x) => !x || faithfulSet.has(sectionKey(x.id)))) continue;
  const grids = (items as SectionItem[]).map((x) => makeCellGrid(pack, pack.decodeSection(x)));
  // 抄的编码器先对一下：34 列压第一个区段，要和正式编码器逐字节相同
  const d0 = makeSection(grids[0]!), formal = encodeSection(d0, pack.模型), copied = compressWidth({ ...grids[0]!, cm: arrangePalette(grids[0]!).cm, palette: Array.from(d0.palette) }, L, pack.模型);
  if (Buffer.compare(formal, copied)) throw new Error(`抄的编码器和正式的不一样：${sectionKey(grids[0]!.id)}`);
  const processed = grids.map((g) => { const h = copyGrid(g); fillSealedCavity(h); replaceBuriedWithStone(h); return h; });
  // 留裙边的做法下，相邻区段共用的那几列两份抄本应该一样
  for (const [cornerA, secondIdx, swapAxis] of [[0, 1, 0], [2, 3, 0], [0, 2, 1], [1, 3, 1]] as const) {
    const A = processed[cornerA]!, B = processed[secondIdx]!;
    for (let t = 0; t < sectionSide; t++) for (const [ca, cb] of [[32, 0], [33, 1]] as const) {
      const pa = swapAxis ? ca * sectionSide + t : t * sectionSide + ca, pb = swapAxis ? cb * sectionSide + t : t * sectionSide + cb;
      for (let z = Math.max(A.kBottom, B.kBottom); z < Math.min(A.kBottom + A.nz, B.kBottom + B.nz); z++) {
        const x = A.cm[pa * A.nz + z - A.kBottom]!, y = B.cm[pb * B.nz + z - B.kBottom]!;
        if (A.palette[2 * x] !== B.palette[2 * y] || A.palette[2 * x + 1] !== B.palette[2 * y + 1]) copyMismatch++;
      }
    }
  }
  st.组++;
  st.四个原样 += (items as SectionItem[]).reduce((n, x) => n + x.len, 0);
  st['四个1+3'] += processed.reduce((n, g) => n + encodeSection(makeSection(g), pack.模型).length, 0);
  st.拼原样 += compressWidth(arrangePalette(combineQuad(grids, pack.stoneState, pack.stateFull)), L, pack.模型).length;
  const packedAfter = combineQuad(processed, pack.stoneState, pack.stateFull);
  st['拼1+3'] += compressWidth(arrangePalette(packedAfter), L, pack.模型).length;
  fillSealedCavity(packedAfter); replaceBuriedWithStone(packedAfter);
  st['拼后再做1+3'] += compressWidth(arrangePalette(packedAfter), L, pack.模型).length;
}
const total = Object.fromEntries(colNames.map((k) => [k, 0])) as Record<(typeof colNames)[number], number>;
let sumBytes = 0;
for (let L = 0; L < 7; L++) if (levelStats[L]!.组) { sumBytes += fullLevelBytes[L]!; for (const k of colNames) total[k] += fullLevelBytes[L]! * levelStats[L]![k] / levelStats[L]!.四个原样; }
console.log(JSON.stringify({
  包: packName, 每级: perLevel, 保真: fidelityFile ?? null, 抄本不同的格: copyMismatch,
  级: levelStats.map((x, L) => ({ L, ...x, 拼比四个_原样: x.组 ? x.拼原样 / x.四个原样 : null, 拼比四个_1加3: x.组 ? x['拼1+3'] / x['四个1+3'] : null, 拼后再做比四个_1加3: x.组 ? x['拼后再做1+3'] / x['四个1+3'] : null })),
  // 各级样本比 × 全包该级区段字节；没有成组样本的级不算进分母
  加权估计_对现行格式: Object.fromEntries(colNames.map((k) => [k, total[k] / sumBytes])), 加权覆盖的字节占比: sumBytes / fullLevelBytes.reduce((a, b) => a + b, 0),
}, null, 1));
