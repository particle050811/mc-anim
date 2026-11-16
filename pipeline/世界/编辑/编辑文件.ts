// 世界的编辑文件 sourcing/worlds/<世界>.编辑.toml：烘焙前按顺序套到存档读出的方块上（存档本身不动），让 Agent 不开游戏就能改地形。
//   note = "整份编辑是干什么的"
//   [[step]]
//   note = "这一步为什么"
//   command = "fill 39000 70 -1000 39010 75 -990 minecraft:stone"     # 也可以是数组，或多行字符串（一行一条，# 开头的行不算）
// 命令写法见 命令.ts。方块状态按方块表校验，结构文件读进来记 sha（编辑集.sha256 = 编辑文件 + 用到的结构字节，进地形登记的来源）。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { readAssetLock, resolveAsset } from '../../资产/资产锁.ts';
import type { BlockKnowledge } from '../体素库.ts';
import { worldDir } from '../声明.ts';
import { parseCommand, CommandError, type EditStep } from './编辑命令.ts';
import { BlockTableIndex, StateSyntaxError } from './方块状态.ts';
import { readStructure, type Structure } from './结构.ts';

export type EditSet = {
  /** 编辑文件的绝对路径 */
  file: string;
  note?: string;
  /** 编辑文件和用到的结构文件的字节一起算的 sha256 */
  sha256: string;
  step: EditStep[];
  /** 结构里方块表没有的状态（烘焙时进 缺失.tsv），按结构名 */
  structMissingStates: Record<string, string[]>;
};

export class EditFileError extends Error {}

/** 结构名 → 字节：asset:<id> 按资产锁取数据根；否则是相对 基目录 的路径 */
export const structureBytes = (structNameOrPath: string, baseDir: string): Buffer => {
  if (structNameOrPath.startsWith('asset:')) return fs.readFileSync(resolveAsset(structNameOrPath.slice(6), readAssetLock()).file);
  const f = path.resolve(baseDir, structNameOrPath);
  if (!fs.existsSync(f)) throw new EditFileError(`结构文件不存在：${f}`);
  return fs.readFileSync(f);
};

/** 把编辑文件里每步的命令摊平成 [命令, 出处] */
const spreadCommands = (commandTable: Record<string, unknown>, fileName: string): [string, string, string | undefined][] => {
  const steps = commandTable['step'];
  if (steps === undefined) return [];
  if (!Array.isArray(steps)) throw new EditFileError(`${fileName}：step 要写成 [[step]]`);
  const out: [string, string, string | undefined][] = [];
  steps.forEach((s: Record<string, unknown>, i) => {
    const stepSource = `${fileName} 第 ${i + 1} 步`;
    const note = typeof s['note'] === 'string' ? (s['note'] as string) : undefined;
    const command = s['command'];
    const lines = typeof command === 'string' ? command.split('\n') : Array.isArray(command) && command.every((c) => typeof c === 'string') ? (command as string[]) : null;
    if (!lines) throw new EditFileError(`${stepSource}：command 要是字符串或字符串数组`);
    for (const k of Object.keys(s)) if (k !== 'note' && k !== 'command') throw new EditFileError(`${stepSource}：不认识的字段 ${k}（只有 note、command）`);
    for (const line of lines.map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))) out.push([line, stepSource, note]);
  });
  return out;
};

/** 解析编辑文本；结构用 取结构字节 取（测试里可以换） */
export const parseEdits = (text: string, file: string, knowledge: Pick<BlockKnowledge, 'allStates'>, loadStructureBytes: (structNameOrPath: string) => Buffer): EditSet => {
  const fileName = path.basename(file);
  let editTable: Record<string, unknown>;
  try {
    editTable = parse(text) as Record<string, unknown>;
  } catch (e) {
    throw new EditFileError(`${fileName} 不是合法的 TOML：${(e as Error).message}`);
  }
  for (const k of Object.keys(editTable)) if (k !== 'note' && k !== 'step') throw new EditFileError(`${fileName}：不认识的字段 ${k}（顶层只有 note、[[step]]）`);
  const stateIndex = new BlockTableIndex(knowledge.allStates);
  const known = new Set(knowledge.allStates);
  const structureCache = new Map<string, { 结构: Structure; bytes: Buffer }>();
  const structMissingStates: Record<string, string[]> = {};
  const env = {
    validate: (s: Parameters<BlockTableIndex['validate']>[0], raw: string) => stateIndex.validate(s, raw),
    getStructure: (structNameOrPath: string) => {
      let e = structureCache.get(structNameOrPath);
      if (!e) {
        const bytes = loadStructureBytes(structNameOrPath);
        const structure = readStructure(bytes, structNameOrPath);
        e = { 结构: structure, bytes: bytes };
        structureCache.set(structNameOrPath, e);
        const missing = [...new Set(structure.cell.filter((x): x is string => !!x && x !== 'minecraft:air' && !known.has(x)))].sort();
        if (missing.length) structMissingStates[structNameOrPath] = missing;
      }
      return e.结构;
    },
  };
  const steps: EditStep[] = [];
  const errors: string[] = [];
  for (const [line, stepSource] of spreadCommands(editTable, fileName)) {
    try {
      steps.push(parseCommand(line, stepSource, env));
    } catch (e) {
      if (e instanceof CommandError || e instanceof StateSyntaxError || e instanceof EditFileError) errors.push(`${stepSource}：${(e as Error).message}`);
      else throw new Error(`${stepSource}：${(e as Error).message}`);
    }
  }
  if (errors.length) throw new EditFileError(`${fileName} 有 ${errors.length} 处不对：\n  ${errors.join('\n  ')}`);
  const h = createHash('sha256').update(text);
  for (const [structNameOrPath, e] of [...structureCache].sort((a, b) => (a[0] < b[0] ? -1 : 1))) h.update(`\0${structNameOrPath}\0`).update(e.bytes);
  return { file: file, note: typeof editTable['note'] === 'string' ? (editTable['note'] as string) : undefined, sha256: h.digest('hex'), step: steps, structMissingStates };
};

/** 读一个世界的编辑文件；结构路径相对 sourcing/worlds/ */
export const readEdits = (file: string, knowledge: Pick<BlockKnowledge, 'allStates'>): EditSet => parseEdits(fs.readFileSync(file, 'utf8'), file, knowledge, (structNameOrPath) => structureBytes(structNameOrPath, worldDir()));
