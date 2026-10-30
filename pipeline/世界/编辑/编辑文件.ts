// 世界的编辑文件 sourcing/worlds/<世界>.编辑.toml：烘焙前按顺序套到存档读出的方块上（存档本身不动），让 Agent 不开游戏就能改地形。
//   "说明" = "整份编辑是干什么的"            （键带引号：TOML 1.0 的裸键只能是 ASCII，和世界声明一样）
//   [["步"]]
//   "说明" = "这一步为什么"
//   "命令" = "fill 39000 70 -1000 39010 75 -990 minecraft:stone"     # 也可以是数组，或多行字符串（一行一条，# 开头的行不算）
// 命令写法见 命令.ts。方块状态按方块表校验，结构文件读进来记 sha（编辑集.sha256 = 编辑文件 + 用到的结构字节，进地形登记的来源）。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 读资产锁, 解析资产 } from '../../资产/资产锁.ts';
import type { 方块知识 } from '../体素库.ts';
import { 世界目录 } from '../声明.ts';
import { 解析命令, 命令错误, type 步 } from './命令.ts';
import { 方块表索引, 状态写法错误 } from './方块状态.ts';
import { 读结构, type 结构 } from './结构.ts';

export type 编辑集 = {
  /** 编辑文件的绝对路径 */
  文件: string;
  说明?: string;
  /** 编辑文件和用到的结构文件的字节一起算的 sha256 */
  sha256: string;
  步: 步[];
  /** 结构里方块表没有的状态（烘焙时进 缺失.tsv），按结构名 */
  结构缺状态: Record<string, string[]>;
};

export class 编辑文件错误 extends Error {}

/** 结构名 → 字节：asset:<id> 按资产锁取数据根；否则是相对 基目录 的路径 */
export const 结构字节 = (名: string, 基目录: string): Buffer => {
  if (名.startsWith('asset:')) return fs.readFileSync(解析资产(名.slice(6), 读资产锁()).文件);
  const f = path.resolve(基目录, 名);
  if (!fs.existsSync(f)) throw new 编辑文件错误(`结构文件不存在：${f}`);
  return fs.readFileSync(f);
};

/** 把编辑文件里每步的命令摊平成 [命令, 出处] */
const 摊命令 = (表: Record<string, unknown>, 文件名: string): [string, string, string | undefined][] => {
  const 步们 = 表['步'];
  if (步们 === undefined) return [];
  if (!Array.isArray(步们)) throw new 编辑文件错误(`${文件名}：步 要写成 [["步"]]`);
  const out: [string, string, string | undefined][] = [];
  步们.forEach((s: Record<string, unknown>, i) => {
    const 出处 = `${文件名} 第 ${i + 1} 步`;
    const 说明 = typeof s['说明'] === 'string' ? (s['说明'] as string) : undefined;
    const 命令 = s['命令'];
    const 行们 = typeof 命令 === 'string' ? 命令.split('\n') : Array.isArray(命令) && 命令.every((c) => typeof c === 'string') ? (命令 as string[]) : null;
    if (!行们) throw new 编辑文件错误(`${出处}：命令 要是字符串或字符串数组`);
    for (const k of Object.keys(s)) if (k !== '说明' && k !== '命令') throw new 编辑文件错误(`${出处}：不认识的字段 ${k}（只有 说明、命令）`);
    for (const 行 of 行们.map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))) out.push([行, 出处, 说明]);
  });
  return out;
};

/** 解析编辑文本；结构用 取结构字节 取（测试里可以换） */
export const 解析编辑 = (文本: string, 文件: string, 知识: Pick<方块知识, '全部状态'>, 取结构字节: (名: string) => Buffer): 编辑集 => {
  const 文件名 = path.basename(文件);
  let 表: Record<string, unknown>;
  try {
    表 = parse(文本) as Record<string, unknown>;
  } catch (e) {
    throw new 编辑文件错误(`${文件名} 不是合法的 TOML：${(e as Error).message}`);
  }
  for (const k of Object.keys(表)) if (k !== '说明' && k !== '步') throw new 编辑文件错误(`${文件名}：不认识的字段 ${k}（顶层只有 说明、[["步"]]）`);
  const 索引 = new 方块表索引(知识.全部状态);
  const 已有 = new Set(知识.全部状态);
  const 结构们 = new Map<string, { 结构: 结构; 字节: Buffer }>();
  const 结构缺状态: Record<string, string[]> = {};
  const 环境 = {
    校验: (s: Parameters<方块表索引['校验']>[0], 原文: string) => 索引.校验(s, 原文),
    取结构: (名: string) => {
      let e = 结构们.get(名);
      if (!e) {
        const 字节 = 取结构字节(名);
        const 结构 = 读结构(字节, 名);
        e = { 结构, 字节 };
        结构们.set(名, e);
        const 缺 = [...new Set(结构.格.filter((x): x is string => !!x && x !== 'minecraft:air' && !已有.has(x)))].sort();
        if (缺.length) 结构缺状态[名] = 缺;
      }
      return e.结构;
    },
  };
  const 步: 步[] = [];
  const 错: string[] = [];
  for (const [行, 出处] of 摊命令(表, 文件名)) {
    try {
      步.push(解析命令(行, 出处, 环境));
    } catch (e) {
      if (e instanceof 命令错误 || e instanceof 状态写法错误 || e instanceof 编辑文件错误) 错.push(`${出处}：${(e as Error).message}`);
      else throw new Error(`${出处}：${(e as Error).message}`);
    }
  }
  if (错.length) throw new 编辑文件错误(`${文件名} 有 ${错.length} 处不对：\n  ${错.join('\n  ')}`);
  const h = createHash('sha256').update(文本);
  for (const [名, e] of [...结构们].sort((a, b) => (a[0] < b[0] ? -1 : 1))) h.update(`\0${名}\0`).update(e.字节);
  return { 文件, 说明: typeof 表['说明'] === 'string' ? (表['说明'] as string) : undefined, sha256: h.digest('hex'), 步, 结构缺状态 };
};

/** 读一个世界的编辑文件；结构路径相对 sourcing/worlds/ */
export const 读编辑 = (文件: string, 知识: Pick<方块知识, '全部状态'>): 编辑集 => 解析编辑(fs.readFileSync(文件, 'utf8'), 文件, 知识, (名) => 结构字节(名, 世界目录()));
