// 预生成计划：世界声明的 [[预生成.块]] → Chunky 的选区、图案和命令（取材服务端里临时装上 Chunky 跑，见 看守.ts）。
// 每条选区命令后面跟着 Chunky 回的那句话（lang/en.json 的 format_*）：哪条没生效（比如 csv 名不认），选区就还是上一次的，
// 接着 chunky start 会按错的范围生成，所以执行时没等到回话就停服。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { worldDir, type WorldDecl, type PregenBox } from '../声明.ts';
import { enclosingSquare, rectCenterHalf, rectChunkBox, corridorChunks } from './范围.ts';

export type PregenSelection = { shape: 'square' | 'rectangle'; center: [number, number]; halfSide: [number, number] };
export type PregenPlan = {
  tile: PregenBox;
  selection: PregenSelection;
  /** region = 按选区逐区域生成；csv = 按 区块 列表的顺序逐个生成（列表要拷进 <服务端>/config/chunky/<csv名>.csv） */
  pattern: 'region' | 'csv';
  csvName?: string;
  chunks?: [number, number][];
  chunkCount: number;
  /** [命令, 执行后要在日志里等到的话] */
  steps: [string, string][];
};

/** Chunky 的命令参数只认 ASCII 的一个词，csv 名取世界名加块名的摘要 */
export const csvName = (worldName: string, pregenName: string) => `anim-${createHash('sha1').update(`${worldName}/${pregenName}`).digest('hex').slice(0, 10)}`;
/** csv 图案的文件内容：一行一个「cx,cz」 */
export const csvText = (chunks: readonly [number, number][]) => chunks.map(([x, z]) => `${x},${z}\n`).join('');

const selectionSteps = (dimension: string, s: PregenSelection, pattern: string): [string, string][] => [
  [`chunky world ${dimension}`, 'World changed to'],
  [`chunky shape ${s.shape}`, `Shape changed to ${s.shape}`],
  [`chunky center ${s.center[0]} ${s.center[1]}`, 'Center changed to'],
  s.shape === 'square' ? [`chunky radius ${s.halfSide[0]}`, 'Radius changed to'] : [`chunky radius ${s.halfSide[0]} ${s.halfSide[1]}`, 'Radius changed for x to'],
  [`chunky pattern ${pattern}`, `Pattern changed to ${pattern.split(' ')[0]}`],
];

const readChunkTable = (k: PregenBox): [number, number][] => {
  const f = path.join(worldDir(), k.file!);
  const chunkTable = JSON.parse(fs.readFileSync(f, 'utf8')) as { chunks?: [number, number][] };
  if (!Array.isArray(chunkTable.chunks) || !chunkTable.chunks.every((c) => Array.isArray(c) && c.length === 2 && c.every(Number.isInteger))) throw new Error(`${f} 要写 {"区块": [[cx, cz], …]}`);
  return chunkTable.chunks;
};

/** 一块的计划；只要 只要 那一块（不写 = 全部） */
export const pregenPlans = (w: WorldDecl, onlyBlock?: string, extra: PregenBox[] = []): PregenPlan[] => {
  const allBlocks = [...w.pregen.tile, ...extra];
  const chunks = allBlocks.filter((k) => (onlyBlock ? k.name === onlyBlock : !extra.length || extra.includes(k)));
  if (onlyBlock && !chunks.length) throw new Error(`世界 ${w.displayName} 没有预生成块 ${onlyBlock}；有：${w.pregen.tile.map((k) => k.name).join('、') || '（无）'}`);
  return chunks.map((k): PregenPlan => {
    if (k.shape === '走廊' || k.shape === '区块表') {
      const chunks = k.shape === '走廊' ? corridorChunks(k, allBlocks) : readChunkTable(k);
      if (!chunks.length) throw new Error(`${k.shape} ${k.name} 一个区块都没有`);
      const bounds = enclosingSquare(chunks);
      const selection: PregenSelection = { shape: 'square', center: bounds.center, halfSide: [bounds.halfSide, bounds.halfSide] };
      const csvId = csvName(w.displayName, k.name);
      return { tile: k, selection: selection, pattern: 'csv', csvName: csvId, chunks: chunks, chunkCount: chunks.length, steps: selectionSteps(w.dimension, selection, `csv ${csvId}`) };
    }
    const { center: center, halfSide: halfSide } = rectCenterHalf(k);
    const chunkRect = rectChunkBox(k);
    const selection: PregenSelection = { shape: halfSide[0] === halfSide[1] ? 'square' : 'rectangle', center: center, halfSide: halfSide };
    return { tile: k, selection: selection, pattern: 'region', chunkCount: (chunkRect.cx1 - chunkRect.cx0 + 1) * (chunkRect.cz1 - chunkRect.cz0 + 1), steps: selectionSteps(w.dimension, selection, 'region') };
  });
};

/** 只打印时给人看的命令（csv 那一块另要把列表放进 config/chunky/） */
export const printCommands = (p: PregenPlan) => [...p.steps.map(([c]) => c), 'chunky start'];
