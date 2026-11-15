// 预生成计划：世界声明的 [[预生成.块]] → Chunky 的选区、图案和命令（取材服务端里临时装上 Chunky 跑，见 看守.ts）。
// 每条选区命令后面跟着 Chunky 回的那句话（lang/en.json 的 format_*）：哪条没生效（比如 csv 名不认），选区就还是上一次的，
// 接着 chunky start 会按错的范围生成，所以执行时没等到回话就停服。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { worldDir, type WorldDecl, type PregenBox } from '../声明.ts';
import { enclosingSquare, rectCenterHalf, rectChunkBox, corridorChunks } from './范围.ts';

export type PregenSelection = { 形状: 'square' | 'rectangle'; 中心: [number, number]; 半边: [number, number] };
export type PregenPlan = {
  块: PregenBox;
  selection: PregenSelection;
  /** region = 按选区逐区域生成；csv = 按 区块 列表的顺序逐个生成（列表要拷进 <服务端>/config/chunky/<csv名>.csv） */
  pattern: 'region' | 'csv';
  csvName?: string;
  区块?: [number, number][];
  区块数: number;
  /** [命令, 执行后要在日志里等到的话] */
  步骤: [string, string][];
};

/** Chunky 的命令参数只认 ASCII 的一个词，csv 名取世界名加块名的摘要 */
export const csvName = (worldName: string, pregenName: string) => `anim-${createHash('sha1').update(`${worldName}/${pregenName}`).digest('hex').slice(0, 10)}`;
/** csv 图案的文件内容：一行一个「cx,cz」 */
export const csvText = (chunks: readonly [number, number][]) => chunks.map(([x, z]) => `${x},${z}\n`).join('');

const selectionSteps = (dimension: string, s: PregenSelection, pattern: string): [string, string][] => [
  [`chunky world ${dimension}`, 'World changed to'],
  [`chunky shape ${s.形状}`, `Shape changed to ${s.形状}`],
  [`chunky center ${s.中心[0]} ${s.中心[1]}`, 'Center changed to'],
  s.形状 === 'square' ? [`chunky radius ${s.半边[0]}`, 'Radius changed to'] : [`chunky radius ${s.半边[0]} ${s.半边[1]}`, 'Radius changed for x to'],
  [`chunky pattern ${pattern}`, `Pattern changed to ${pattern.split(' ')[0]}`],
];

const readChunkTable = (k: PregenBox): [number, number][] => {
  const f = path.join(worldDir(), k.文件!);
  const chunkTable = JSON.parse(fs.readFileSync(f, 'utf8')) as { 区块?: [number, number][] };
  if (!Array.isArray(chunkTable.区块) || !chunkTable.区块.every((c) => Array.isArray(c) && c.length === 2 && c.every(Number.isInteger))) throw new Error(`${f} 要写 {"区块": [[cx, cz], …]}`);
  return chunkTable.区块;
};

/** 一块的计划；只要 只要 那一块（不写 = 全部） */
export const pregenPlans = (w: WorldDecl, onlyBlock?: string, extra: PregenBox[] = []): PregenPlan[] => {
  const allBlocks = [...w.预生成.块, ...extra];
  const chunks = allBlocks.filter((k) => (onlyBlock ? k.名 === onlyBlock : !extra.length || extra.includes(k)));
  if (onlyBlock && !chunks.length) throw new Error(`世界 ${w.名称} 没有预生成块 ${onlyBlock}；有：${w.预生成.块.map((k) => k.名).join('、') || '（无）'}`);
  return chunks.map((k): PregenPlan => {
    if (k.形状 === '走廊' || k.形状 === '区块表') {
      const chunks = k.形状 === '走廊' ? corridorChunks(k, allBlocks) : readChunkTable(k);
      if (!chunks.length) throw new Error(`${k.形状} ${k.名} 一个区块都没有`);
      const bounds = enclosingSquare(chunks);
      const selection: PregenSelection = { 形状: 'square', 中心: bounds.中心, 半边: [bounds.半边, bounds.半边] };
      const csvId = csvName(w.名称, k.名);
      return { 块: k, selection: selection, pattern: 'csv', csvName: csvId, 区块: chunks, 区块数: chunks.length, 步骤: selectionSteps(w.维度, selection, `csv ${csvId}`) };
    }
    const { 中心: center, 半边: halfSide } = rectCenterHalf(k);
    const chunkRect = rectChunkBox(k);
    const selection: PregenSelection = { 形状: halfSide[0] === halfSide[1] ? 'square' : 'rectangle', 中心: center, 半边: halfSide };
    return { 块: k, selection: selection, pattern: 'region', 区块数: (chunkRect.cx1 - chunkRect.cx0 + 1) * (chunkRect.cz1 - chunkRect.cz0 + 1), 步骤: selectionSteps(w.维度, selection, 'region') };
  });
};

/** 只打印时给人看的命令（csv 那一块另要把列表放进 config/chunky/） */
export const printCommands = (p: PregenPlan) => [...p.步骤.map(([c]) => c), 'chunky start'];
