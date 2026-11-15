// 封腔填实（变换 3）前后网格少多少面：离线估渲染能省多少（用户 11-14 定做 3、要量渲染节约）。埋格换石不改网格，不用量。
//   node wasm/实验/地形可见/面数.ts <包名> (--集 <清单> | --随机 <每级几段> | --用量 <作品>/<段> [--抽 <几段，默认 800>]) [--保真 <清单>] > 结果.json
// --用量：从渲染时记下的 run/地形用量/<作品>/<段>.json 里抽这一段真画过的区段，和 bench 的窗口对得上。
// 面数、字节按 网格.ts 出的数组算（一个面 4 个顶点：位置 12、UV 8、贴图层 16、颜色 16 个数），第 0 级树叶镂空、粗级实心。
import fs from 'node:fs';
import path from 'node:path';
import { dataRoot } from '../../../pipeline/环境/配置.ts';
import { load, openPack, makeCellGrid, copyGrid, sectionKey, terrainRoot, terrainPackDirs, buildMesh, type SectionItem } from './公共.ts';
import { fillSealedCavity } from '../../../pipeline/世界/烘焙/可见.ts';
import type { SectionMesh } from '../../../engine/voxel/网格.ts';

const cliParams = process.argv.slice(2), packName = cliParams[0]!;
const getArg = (flagName: string) => { const i = cliParams.indexOf(flagName); return i < 0 ? undefined : cliParams[i + 1]; };
const env = await load(), pack = openPack(env, terrainRoot(), packName);
const fidelityFile = getArg('--保真'), faithfulSet = new Set(fidelityFile ? fs.readFileSync(fidelityFile, 'utf8').split('\n').filter(Boolean) : []);
let seed = 20261114;
const shuffle = <T>(a: T[]) => { for (let k = a.length - 1; k > 0; k--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (k + 1); [a[k], a[j]] = [a[j]!, a[k]!]; } return a; };
let testSet: SectionItem[], sourcePath: string, usedSectionCount: number | undefined, usedFaithful: number | undefined;
if (getArg('--集')) { sourcePath = getArg('--集')!; testSet = fs.readFileSync(sourcePath, 'utf8').split('\n').filter(Boolean).map((k) => pack.lookup.get(k.trim().split(/\s+/)[0]!)!); }
else if (getArg('--随机')) { sourcePath = `随机每级 ${getArg('--随机')}`; testSet = pack.级.flatMap((bin) => shuffle(bin.slice()).slice(0, Number(getArg('--随机')))); }
else {
  sourcePath = `用量 ${getArg('--用量')}`;
  const j = JSON.parse(fs.readFileSync(path.join(dataRoot(), 'run', '地形用量', `${getArg('--用量')}.json`), 'utf8')) as { 包: Record<string, { 版本: string; 区段: string[] }> };
  const p = j.包[packName];
  if (!p || p.版本 !== path.basename(terrainPackDirs[packName]!)) throw new Error('这一段的用量里没有这个包的这个版本');
  const segKeys = p.区段.map((k) => k.replaceAll('|', '/'));
  usedSectionCount = segKeys.length; usedFaithful = segKeys.filter((k) => faithfulSet.has(k)).length;
  testSet = shuffle(segKeys.map((k) => pack.lookup.get(k)).filter((x): x is SectionItem => !!x)).slice(0, Number(getArg('--抽') ?? 800));
}
const materialKinds = ['实心', '镂空', '实心树叶', '水', '花草'] as const;
const faceBytes = (m: SectionMesh) => materialKinds.reduce((s, k) => s + m[k].pos.byteLength + m[k].uv.byteLength + m[k].tex.byteLength + m[k].col.byteLength, 0);
const zeroCounts = () => ({ 段: 0, 保真段: 0, 有变的段: 0, 面前: 0, 面后: 0, 字节前: 0, 字节后: 0, 填的格: 0, 各材质前: Object.fromEntries(materialKinds.map((k) => [k, 0])) as Record<(typeof materialKinds)[number], number>, 各材质后: Object.fromEntries(materialKinds.map((k) => [k, 0])) as Record<(typeof materialKinds)[number], number> });
const levels = Array.from({ length: 7 }, zeroCounts), total = zeroCounts();
for (const s of testSet) {
  const isFaithful = faithfulSet.has(sectionKey(s.id)), g0 = makeCellGrid(pack, pack.decodeSection(s)), m0 = buildMesh(env, pack, g0);
  let m3 = m0, enclosedCount = 0;
  if (!isFaithful) { const g3 = copyGrid(g0); enclosedCount = fillSealedCavity(g3).length; if (enclosedCount) m3 = buildMesh(env, pack, g3); }
  for (const t of [levels[s.id.L]!, total]) {
    t.段++; t.保真段 += isFaithful ? 1 : 0; t.填的格 += enclosedCount; t.有变的段 += m3.面数 !== m0.面数 ? 1 : 0;
    t.面前 += m0.面数; t.面后 += m3.面数; t.字节前 += faceBytes(m0); t.字节后 += faceBytes(m3);
    for (const k of materialKinds) { t.各材质前[k] += m0[k].n; t.各材质后[k] += m3[k].n; }
  }
}
const summarize = (t: ReturnType<typeof zeroCounts>) => ({ ...t, 面比: t.面前 ? t.面后 / t.面前 : null, 字节比: t.字节前 ? t.字节后 / t.字节前 : null, 各材质少: Object.fromEntries(materialKinds.map((k) => [k, t.各材质前[k] - t.各材质后[k]])) });
console.log(JSON.stringify({ 包: packName, 源: sourcePath, 用量段数: usedSectionCount, 用量里保真: usedFaithful, 保真: fidelityFile ?? null, 合: summarize(total), 级: levels.map((t, L) => ({ L, ...summarize(t) })) }, null, 1));
