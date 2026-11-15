// 封腔填实（变换 3）前后网格少多少面：离线估渲染能省多少（用户 11-14 定做 3、要量渲染节约）。埋格换石不改网格，不用量。
//   node wasm/实验/地形可见/面数.ts <包名> (--集 <清单> | --随机 <每级几段> | --用量 <作品>/<段> [--抽 <几段，默认 800>]) [--保真 <清单>] > 结果.json
// --用量：从渲染时记下的 run/地形用量/<作品>/<段>.json 里抽这一段真画过的区段，和 bench 的窗口对得上。
// 面数、字节按 网格.ts 出的数组算（一个面 4 个顶点：位置 12、UV 8、贴图层 16、颜色 16 个数），第 0 级树叶镂空、粗级实心。
import fs from 'node:fs';
import path from 'node:path';
import { 数据根 } from '../../../pipeline/环境/配置.ts';
import { 载入, 开包, 成格子, 抄, 键, terrain根, 包目录, type 区段项 } from './公共.ts';
import { 填封闭腔 } from './变换.ts';
import { 建网格 } from './核对.ts';
import type { SectionMesh } from '../../../engine/voxel/网格.ts';

const 参 = process.argv.slice(2), 包名 = 参[0]!;
const 取参 = (名: string) => { const i = 参.indexOf(名); return i < 0 ? undefined : 参[i + 1]; };
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const 保真文件 = 取参('--保真'), 保真 = new Set(保真文件 ? fs.readFileSync(保真文件, 'utf8').split('\n').filter(Boolean) : []);
let seed = 20261114;
const 乱 = <T>(a: T[]) => { for (let k = a.length - 1; k > 0; k--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (k + 1); [a[k], a[j]] = [a[j]!, a[k]!]; } return a; };
let 测: 区段项[], 源: string, 用量段数: number | undefined, 用量里保真: number | undefined;
if (取参('--集')) { 源 = 取参('--集')!; 测 = fs.readFileSync(源, 'utf8').split('\n').filter(Boolean).map((k) => 包.查.get(k.trim().split(/\s+/)[0]!)!); }
else if (取参('--随机')) { 源 = `随机每级 ${取参('--随机')}`; 测 = 包.级.flatMap((bin) => 乱(bin.slice()).slice(0, Number(取参('--随机')))); }
else {
  源 = `用量 ${取参('--用量')}`;
  const j = JSON.parse(fs.readFileSync(path.join(数据根(), 'run', '地形用量', `${取参('--用量')}.json`), 'utf8')) as { 包: Record<string, { 版本: string; 区段: string[] }> };
  const p = j.包[包名];
  if (!p || p.版本 !== path.basename(包目录[包名]!)) throw new Error('这一段的用量里没有这个包的这个版本');
  const 全 = p.区段.map((k) => k.replaceAll('|', '/'));
  用量段数 = 全.length; 用量里保真 = 全.filter((k) => 保真.has(k)).length;
  测 = 乱(全.map((k) => 包.查.get(k)).filter((x): x is 区段项 => !!x)).slice(0, Number(取参('--抽') ?? 800));
}
const 材质 = ['实心', '镂空', '实心树叶', '水', '花草'] as const;
const 面字节 = (m: SectionMesh) => 材质.reduce((s, k) => s + m[k].pos.byteLength + m[k].uv.byteLength + m[k].tex.byteLength + m[k].col.byteLength, 0);
const 零 = () => ({ 段: 0, 保真段: 0, 有变的段: 0, 面前: 0, 面后: 0, 字节前: 0, 字节后: 0, 填的格: 0, 各材质前: Object.fromEntries(材质.map((k) => [k, 0])) as Record<(typeof 材质)[number], number>, 各材质后: Object.fromEntries(材质.map((k) => [k, 0])) as Record<(typeof 材质)[number], number> });
const 级 = Array.from({ length: 7 }, 零), 合 = 零();
for (const s of 测) {
  const 是保真 = 保真.has(键(s.id)), g0 = 成格子(包, 包.解(s)), m0 = 建网格(环, 包, g0);
  let m3 = m0, 填 = 0;
  if (!是保真) { const g3 = 抄(g0); 填 = 填封闭腔(g3).length; if (填) m3 = 建网格(环, 包, g3); }
  for (const t of [级[s.id.L]!, 合]) {
    t.段++; t.保真段 += 是保真 ? 1 : 0; t.填的格 += 填; t.有变的段 += m3.面数 !== m0.面数 ? 1 : 0;
    t.面前 += m0.面数; t.面后 += m3.面数; t.字节前 += 面字节(m0); t.字节后 += 面字节(m3);
    for (const k of 材质) { t.各材质前[k] += m0[k].n; t.各材质后[k] += m3[k].n; }
  }
}
const 出 = (t: ReturnType<typeof 零>) => ({ ...t, 面比: t.面前 ? t.面后 / t.面前 : null, 字节比: t.字节前 ? t.字节后 / t.字节前 : null, 各材质少: Object.fromEntries(材质.map((k) => [k, t.各材质前[k] - t.各材质后[k]])) });
console.log(JSON.stringify({ 包: 包名, 源, 用量段数, 用量里保真, 保真: 保真文件 ?? null, 合: 出(合), 级: 级.map((t, L) => ({ L, ...出(t) })) }, null, 1));
