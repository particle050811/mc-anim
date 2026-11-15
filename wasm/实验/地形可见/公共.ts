// 地形包「只保真看得见的格子」原型留下的公共部分：读包、抽样、建网格。四项安全项已做进管线（pipeline/世界/烘焙/可见.ts），这里留的是下一步（拼大区段）的实验和找画面用的工具，
// 结论在 docs/决策/0011-地形压缩.md。包目录 是做变换以前的版本（实验都在原样的包上量）。
// 只读现行格式 3 的包，不写数据根。engine/voxel 带 asset: 的模块要先注册资产钩子，所以动态 import。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { 载入体素库 } from '../../../pipeline/世界/体素库.ts';
import { 代码根 } from '../../../pipeline/环境/路径.ts';
import { 数据根 } from '../../../pipeline/环境/配置.ts';
import { 读模型, type 区段模型 } from '../../../engine/voxel/区段模型.ts';
import { 压区段, 到列优先 } from '../../../pipeline/世界/烘焙/区段编码.ts';
import type { SectionData, 包信息, 包表 } from '../../../engine/voxel/区段包.ts';
import type * as 网格模块 from '../../../engine/voxel/网格.ts';
import type * as 导入区段模块 from '../../../engine/voxel/导入区段.ts';
import type { SectionMesh } from '../../../engine/voxel/网格.ts';
import { 成格子 as 管线成格子, 成区段, type 格子 } from '../../../pipeline/世界/烘焙/可见.ts';
export { 抄, 成区段, type 格子 } from '../../../pipeline/世界/烘焙/可见.ts';

export const 边 = 34;
export const 包目录: Record<string, string> = { '主世界-116': '主世界-116/5c8a6378419e', '暮色放大-1752-扩展': '暮色放大-1752-扩展/c42d60d01992' };
export type 区段号 = { L: number; i: number; j: number };
export type 区段项 = { file: string; off: number; len: number; id: 区段号 };
export const 键 = (id: 区段号) => `${id.L}/${id.i}/${id.j}`;

export const 载入 = async () => {
  const 库 = await 载入体素库();
  const 载 = <T>(名: string) => import(pathToFileURL(path.join(代码根(), 'engine', 'voxel', 名)).href) as Promise<T>;
  const [网格, 导入区段] = await Promise.all([载<typeof 网格模块>('网格.ts'), 载<typeof 导入区段模块>('导入区段.ts')]);
  return { 库, 网格, 导入区段 };
};
export type 环境 = Awaited<ReturnType<typeof 载入>>;

export type 包 = {
  名: string; dir: string; 模型: 区段模型; info: 包信息; tables: 包表;
  /** 第 L 级的区段，按块文件名、块内索引先后（和 wasm/实验/测地形.mjs 同一顺序，留出集才对得上） */
  级: 区段项[][];
  查: Map<string, 区段项>;
  石状态: number;
  /** 色板号 → 是不是整格不透明（网格.ts 的 occlusionMask 第 0 位）；按状态号查 */
  状态满: Uint8Array;
  /** 状态号 → 网格.ts 的挡面掩码：1 整格不透明、2 树叶、4 水这一层 */
  状态罩: Uint8Array;
  读: (s: 区段项) => Buffer;
  解: (s: 区段项) => SectionData;
  体素上下文: 导入区段模块.区段上下文;
};

export const 开包 = (环: 环境, terrain根: string, 名: string): 包 => {
  const dir = path.join(terrain根, 包目录[名]!);
  const 模型 = 读模型(fs.readFileSync(path.join(dir, '模型.bin')));
  const info = JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')) as 包信息;
  const { tileEntryCount, tileHeaderLen, buildPackTables } = 环.库.区段包;
  const 级: 区段项[][] = Array.from({ length: 7 }, () => []);
  const 查 = new Map<string, 区段项>();
  const fds = new Map<string, number>();
  const fd = (file: string) => { let f = fds.get(file); if (f === undefined) fds.set(file, (f = fs.openSync(path.join(dir, file), 'r'))); return f; };
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.块')).sort()) {
    const buf = Buffer.alloc(tileHeaderLen);
    if (fs.readSync(fd(file), buf, 0, tileHeaderLen, 0) !== tileHeaderLen || buf.readUInt32LE(4) !== 3) throw new Error(`${file} 不是格式 3`);
    const [tx, ty] = file.split('.').map(Number) as [number, number];
    let slot = 0;
    for (let L = 0; L < 7; L++) {
      const edge = 64 >> L;
      for (let j = 0; j < edge; j++) for (let i = 0; i < edge; i++, slot++) {
        const off = buf.readUInt32LE(16 + slot * 8), len = buf.readUInt32LE(20 + slot * 8);
        if (!len) continue;
        const 项 = { file, off, len, id: { L, i: tx * edge + i, j: ty * edge + j } };
        级[L]!.push(项);
        查.set(键(项.id), 项);
      }
    }
    if (slot !== tileEntryCount) throw new Error('块索引项数对不上');
  }
  const tables = buildPackTables(info);
  const 石状态 = info.状态.indexOf('minecraft:stone');
  if (石状态 < 0) throw new Error(`${名} 的状态表里没有 minecraft:stone`);
  const FULL = 环.库.方块表.blockProps.full;
  const 状态满 = Uint8Array.from(info.状态, (_, s) => FULL[tables.值[s]!]!);
  if (!状态满[石状态]) throw new Error('石头不是整格不透明');
  const { leaf: LEAF, layer: CLS } = 环.库.方块表.blockProps;
  const 状态罩 = Uint8Array.from(info.状态, (_, s) => { const v = tables.值[s]!; return FULL[v]! | (LEAF[v]! << 1) | (CLS[v] === 3 ? 4 : 0); });
  const 读 = (s: 区段项) => { const raw = Buffer.alloc(s.len); if (fs.readSync(fd(s.file), raw, 0, s.len, s.off) !== s.len) throw new Error('读短了'); return raw; };
  const 体素上下文 = { info, tables, variesByPos: info.群系.map(环.库.群系色.variesByPos), cutBoxes: [], flattenAreas: [] };
  return { 名, dir, 模型, info, tables, 级, 查, 石状态, 状态满, 状态罩, 读, 解: (s) => 环.库.区段解码.解区段(读(s), s.id, 模型), 体素上下文 };
};

/** 和 wasm/实验/测地形.mjs 同一个留出集：种子 31841，各 L 打乱后取前 min(⌊半数⌋, 96) 个测，接着最多 384 个训练。会打乱 包.级 */
export const 留出集 = (包: 包) => {
  let seed = 31841;
  const shuffle = <T>(arr: T[]) => { for (let k = arr.length - 1; k > 0; k--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (k + 1); [arr[k], arr[j]] = [arr[j]!, arr[k]!]; } return arr; };
  const 测: 区段项[] = [], 训: 区段项[] = [];
  for (const bin of 包.级) { shuffle(bin); const n = Math.min(Math.floor(bin.length / 2), 96); 测.push(...bin.slice(0, n)); 训.push(...bin.slice(n, n + Math.min(384, bin.length - n))); }
  shuffle(测);
  return { 测, 训 };
};

// 格子和四项变换用管线的正本（pipeline/世界/烘焙/可见.ts）；这里的 成格子 按原型的包结构取状态表、石头
export const 成格子 = (包: 包, d: SectionData): 格子 => 管线成格子(d, 包.状态满, 包.石状态);
/** 渲染那条路建网格（树叶第 0 级镂空、粗级实心） */
export const 建网格 = (环: 环境, 包: 包, g: 格子, 实心树叶 = g.id.L >= 1): SectionMesh => 环.网格.buildSectionMesh(环.导入区段.importedSectionVoxels(成区段(g), 包.体素上下文), 实心树叶);

const 同 = (a: Uint16Array, b: Uint16Array) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
/** 用现行编码器压，再用正式 WASM 解回逐格比（同 区段编码.ts 的 压并核对） */
export const 压 = (环: 环境, d: SectionData, 模型: 区段模型): Uint8Array => {
  const cm = 到列优先(d), 字节 = 压区段(d, 模型, cm), 回 = 环.库.区段解码.解区段(字节, d, 模型);
  if (回.kBottom !== d.kBottom || 回.nz !== d.nz || !同(回.palette, d.palette) || !同(到列优先(回), cm)) throw new Error(`区段 ${键(d)} 压完解回来不一样`);
  return 字节;
};

export const terrain根 = () => path.join(数据根(), 'terrain');
