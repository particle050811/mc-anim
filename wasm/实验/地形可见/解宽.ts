// 64×64 的解码耗时：把 wasm/区段解码.ts 的每边列数改成 66 另编一份 WASM（只放内存里，不写生成文件、不升格式），
// 解拼出来的 66×66 列大区段，和现行解码器解那四个 34×34 列小区段比。口径同 量.ts：A/B/B/A 各解 8 遍，含 WASM、输入和结果拷贝，不含读盘。
//   node wasm/实验/地形可见/解宽.ts <包名> [--每级 <最多几组，默认 40>] [--保真 <清单>] > 结果.json
// 组的挑法、拼法同 拼大.ts。大区段解回来的格子逐格和拼出来的比，一样才计时。体积顺带量「最终的做法」下四个小的对一个大的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { codeRoot } from '../../../pipeline/环境/路径.ts';
import { encodeSection } from '../../../pipeline/世界/烘焙/区段编码.ts';
import type { SectionModel } from '../../../engine/voxel/区段模型.ts';
import { load, openPack, holdoutSplit, makeCellGrid, copyGrid, makeSection, sectionKey, terrainRoot, type CellGrid, type SectionItem, type SectionId } from './公共.ts';
import { replaceBuriedWithStone, fillSealedCavity, normalizeNeighborRing, replaceCoreEdgeWithStone } from '../../../pipeline/世界/烘焙/可见.ts';
import { compressWidth, arrangePalette, combineQuad, bigCount } from './宽编码.ts';

/** 同 pipeline/世界/区段解码器.ts 的 asc参数（那边没导出；优化选项进 WASM 字节，两边不一样就不是同一种解码器） */
const ascArgs = ['--optimizeLevel', '3', '--shrinkLevel', '0', '--noAssert', '--runtime', 'stub', '--use', 'abort=', '--initialMemory', '8', '--converge'];
const makeWidthDecoder = (width: number) => {
  const sourceText = fs.readFileSync(path.join(codeRoot(), 'wasm', '区段解码.ts'), 'utf8'), oldSnippet = 'const 边: i32 = 34,';
  if (!sourceText.includes(oldSnippet)) throw new Error('wasm/区段解码.ts 里每边列数的写法变了');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), '宽解码器-'));
  try {
    fs.writeFileSync(path.join(workDir, 'x.ts'), sourceText.replace(oldSnippet, `const 边: i32 = ${width},`));
    execFileSync(process.execPath, [path.join(codeRoot(), 'node_modules', 'assemblyscript', 'bin', 'asc.js'), path.join(workDir, 'x.ts'), '-o', path.join(workDir, 'x.wasm'), ...ascArgs], { cwd: codeRoot(), stdio: ['ignore', 'pipe', 'pipe'] });
    return fs.readFileSync(path.join(workDir, 'x.wasm'));
  } finally { fs.rmSync(workDir, { recursive: true, force: true }); }
};
type DecodeFn = (inPtr: number, inLength: number, tablePtr: number, workPtr: number, treeOff: number, cm: number, runOffset: number, countsOffset: number, idsOffset: number, runLengthsPtr: number, nz: number, paletteSize: number, L: number, pal: number, map: number, weights: number, scratch: number, classes: number, stride: number) => number;
/** 照 engine/voxel/区段解码.ts 的 创建 排内存，列数换成 宽² */
const buildWideDecoder = (wasm: Uint8Array, m: SectionModel, width: number) => {
  const columnCount = width * width, { decode, memory } = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(wasm))).exports as { decode: DecodeFn; memory: WebAssembly.Memory };
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
    const input = align(scratch + 8 * n + P), cm = align(input + raw.length + 16), runs = cm + 2 * nz * columnCount, counts = runs + 2 * nz * columnCount, values = counts + 2 * columnCount, lengths = values + 2 * nz * columnCount;
    grow(lengths + 2 * nz * columnCount);
    const mem = new Uint8Array(memory.buffer);
    mem.set(raw, input);
    mem.fill(0, input + raw.length, input + raw.length + 16);
    const R = decode(input + h, len, T, W, tree, cm, runs, counts, values, lengths, nz, P, L, input + 6, M, F, scratch, m.classes, m.stride);
    if (R < 0) throw new Error('宽区段的编码流没有正好读完');
    const ab = new ArrayBuffer((2 * P + columnCount + 2 * R) * 2), palette = new Uint16Array(ab, 0, 2 * P), runCounts = new Uint16Array(ab, 4 * P, columnCount), paletteIndex = new Uint16Array(ab, 4 * P + 2 * columnCount, R), runLengths = new Uint16Array(ab, 4 * P + 2 * columnCount + 2 * R, R);
    new Uint8Array(ab, 0, 4 * P).set(raw.subarray(6, h));
    runCounts.set(new Uint16Array(memory.buffer, counts, columnCount));
    paletteIndex.set(new Uint16Array(memory.buffer, values, R));
    runLengths.set(new Uint16Array(memory.buffer, lengths, R));
    return { kBottom, nz, palette, runCounts, paletteIndex, runLengths, 格: () => new Uint16Array(memory.buffer, cm, nz * columnCount) };
  };
};

const cliParams = process.argv.slice(2), packName = cliParams[0]!;
const getArg = (flagName: string) => { const i = cliParams.indexOf(flagName); return i < 0 ? undefined : cliParams[i + 1]; };
const perLevel = Number(getArg('--每级') ?? 40);
const env = await load(), pack = openPack(env, terrainRoot(), packName);
const fidelityFile = getArg('--保真'), faithfulSet = new Set(fidelityFile ? fs.readFileSync(fidelityFile, 'utf8').split('\n').filter(Boolean) : []);
const wasm = makeWidthDecoder(bigCount), decodeWidth = buildWideDecoder(wasm, pack.模型, bigCount);
type LevelGroup = { L: number; 小: { raw: Uint8Array; id: SectionId }[]; 大: Uint8Array };
const raw: LevelGroup[] = [], afterApply: LevelGroup[] = [], seen = new Set<string>();
const colNames = ['四个原样', '拼原样', '四个最终', '一个大的最终'] as const;
const levelStats = Array.from({ length: 7 }, () => ({ 组: 0, ...(Object.fromEntries(colNames.map((k) => [k, 0])) as Record<(typeof colNames)[number], number>) }));
/** 最终的做法（定底裙边.ts 量出来的）：3 封腔、1 埋格、邻圈只换被埋的并归空，第 0 级再加核心边。窗口 34 列、66 列都能用 */
const applyAll = (g: CellGrid, hasNeighbor: boolean[]) => {
  fillSealedCavity(g); replaceBuriedWithStone(g);
  normalizeNeighborRing(g, Uint8Array.from({ length: g.palette.length / 2 }, (_, p) => (p && pack.stateCover[g.palette[2 * p]!] === 0 ? 1 : 0)));
  if (g.id.L === 0) replaceCoreEdgeWithStone(g, hasNeighbor);
  return g;
};
for (const s of holdoutSplit(pack).测) {
  const { L } = s.id, a = s.id.i >> 1, b = s.id.j >> 1, groupKey = `${L}/${a}/${b}`, st = levelStats[L]!;
  if (seen.has(groupKey) || st.组 >= perLevel) continue;
  seen.add(groupKey);
  const items = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([di, dj]) => pack.lookup.get(sectionKey({ L, i: 2 * a + di!, j: 2 * b + dj! })));
  if (items.some((x) => !x || faithfulSet.has(sectionKey(x.id)))) continue;
  st.组++;
  const grids = (items as SectionItem[]).map((x) => makeCellGrid(pack, pack.decodeSection(x)));
  const neighbors = (i: number, j: number, offset: number) => [[offset, 0], [-offset, 0], [0, offset], [0, -offset]].map(([di, dj]) => pack.lookup.has(sectionKey({ L, i: i + di!, j: j + dj! })));
  const packMergeCheck = (g: ReturnType<typeof combineQuad>) => {
    const palette = arrangePalette(g), raw = compressWidth(palette, L, pack.模型), decoded = decodeWidth(raw, L), cells = decoded.格();
    if (decoded.nz !== palette.nz || decoded.kBottom !== palette.kBottom || Buffer.compare(Buffer.from(cells.buffer, cells.byteOffset, cells.byteLength), Buffer.from(palette.cm.buffer, palette.cm.byteOffset, palette.cm.byteLength))) throw new Error(`宽区段 ${groupKey} 解回来不一样`);
    return raw;
  };
  const bigOriginal = packMergeCheck(combineQuad(grids, pack.stoneState, pack.stateFull));
  // 大的：四个小的先各自封腔、埋格（邻圈、核心边先不动，拼的时候中间那两列要用），拼好再在 66 列的窗口上全做一遍；大区段四周的邻段按 2 个小区段外有没有算
  const bigAfter = packMergeCheck(applyAll(combineQuad(grids.map((g) => { const h = copyGrid(g); fillSealedCavity(h); replaceBuriedWithStone(h); return h; }), pack.stoneState, pack.stateFull), [pack.lookup.has(sectionKey({ L, i: 2 * a + 2, j: 2 * b })), pack.lookup.has(sectionKey({ L, i: 2 * a - 1, j: 2 * b })), pack.lookup.has(sectionKey({ L, i: 2 * a, j: 2 * b + 2 })), pack.lookup.has(sectionKey({ L, i: 2 * a, j: 2 * b - 1 }))]));
  const smallAfter = grids.map((g) => ({ raw: encodeSection(makeSection(applyAll(copyGrid(g), neighbors(g.id.i, g.id.j, 1))), pack.模型), id: g.id }));
  raw.push({ L, 小: (items as SectionItem[]).map((x) => ({ raw: pack.读(x), id: x.id })), 大: bigOriginal });
  afterApply.push({ L, 小: smallAfter, 大: bigAfter });
  st.四个原样 += (items as SectionItem[]).reduce((n, x) => n + x.len, 0); st.拼原样 += bigOriginal.length;
  st.四个最终 += smallAfter.reduce((n, x) => n + x.raw.length, 0); st.一个大的最终 += bigAfter.length;
}
const fullLevelBytes = pack.级.map((b) => b.reduce((n, x) => n + x.len, 0)), total = Object.fromEntries(colNames.map((k) => [k, 0])) as Record<(typeof colNames)[number], number>;
let sumBytes = 0;
for (let L = 0; L < 7; L++) if (levelStats[L]!.组) { sumBytes += fullLevelBytes[L]!; for (const k of colNames) total[k] += fullLevelBytes[L]! * levelStats[L]![k] / levelStats[L]!.四个原样; }
const timingOf = (groups: LevelGroup[]) => {
  const laps: { 谁: string; ms: number }[] = [];
  for (const variant of ['四个小的', '一个大的', '一个大的', '四个小的']) {
    const t = performance.now();
    for (let rep = 0; rep < 8; rep++) for (const g of groups) {
      if (variant === '四个小的') for (const x of g.小) env.库.sectionDecoder.decodeSection(x.raw, x.id, pack.模型);
      else decodeWidth(g.大, g.L);
    }
    laps.push({ 谁: variant, ms: performance.now() - t });
  }
  return { 组: groups.length, 轮: laps, 大比小: [laps[1]!.ms / laps[0]!.ms, laps[2]!.ms / laps[3]!.ms], 四个小的每组毫秒: (laps[0]!.ms + laps[3]!.ms) / 16 / groups.length, 一个大的每组毫秒: (laps[1]!.ms + laps[2]!.ms) / 16 / groups.length };
};
const crossCompare = (() => { const a = timingOf(raw).轮, b = timingOf(afterApply).轮; return { 四个小的原样ms: (a[0]!.ms + a[3]!.ms) / 2, 四个小的最终ms: (b[0]!.ms + b[3]!.ms) / 2, 一个大的最终ms: (b[1]!.ms + b[2]!.ms) / 2 }; })();
console.log(JSON.stringify({
  包: packName, 每级: perLevel, 负载: os.loadavg(), 宽解码器字节: wasm.length,
  级: levelStats.map((x, L) => ({ L, ...x, 大比小_原样: x.组 ? x.拼原样 / x.四个原样 : null, 大比小_最终: x.组 ? x.一个大的最终 / x.四个最终 : null })),
  // 各级样本比 × 全包该级区段字节；没有成组样本的级不算进分母
  加权估计_对现行格式: Object.fromEntries(colNames.map((k) => [k, total[k] / sumBytes])), 加权覆盖的字节占比: sumBytes / fullLevelBytes.reduce((a, b) => a + b, 0),
  解码: { 原样: { 全部: timingOf(raw), 第0级: timingOf(raw.filter((g) => g.L === 0)) }, 最终: { 全部: timingOf(afterApply), 第0级: timingOf(afterApply.filter((g) => g.L === 0)) }, 现行对最终: { ...crossCompare, 小的最终比现行: crossCompare.四个小的最终ms / crossCompare.四个小的原样ms, 大的最终比现行: crossCompare.一个大的最终ms / crossCompare.四个小的原样ms } },
}, null, 1));
