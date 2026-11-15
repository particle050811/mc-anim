// 地形包「只保真看得见的格子」原型留下的公共部分：读包、抽样、建网格。四项安全项已做进管线（pipeline/世界/烘焙/可见.ts），这里留的是下一步（拼大区段）的实验和找画面用的工具，
// 结论在 docs/决策/0011-地形压缩.md。包目录 是做变换以前的版本（实验都在原样的包上量）。
// 只读现行格式 3 的包，不写数据根。engine/voxel 带 asset: 的模块要先注册资产钩子，所以动态 import。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadVoxelLib } from '../../../pipeline/世界/体素库.ts';
import { codeRoot } from '../../../pipeline/环境/路径.ts';
import { dataRoot } from '../../../pipeline/环境/配置.ts';
import { readModel, type SectionModel } from '../../../engine/voxel/区段模型.ts';
import { encodeSection, toColumnMajor } from '../../../pipeline/世界/烘焙/区段编码.ts';
import type { SectionData, PackageInfo, PackTable } from '../../../engine/voxel/区段包.ts';
import type * as meshModule from '../../../engine/voxel/网格.ts';
import type * as importSectionModule from '../../../engine/voxel/导入区段.ts';
import type { SectionMesh } from '../../../engine/voxel/网格.ts';
import { toGrid as pipelineToGrid, makeSection, type CellGrid } from '../../../pipeline/世界/烘焙/可见.ts';
export { copyGrid, makeSection, type CellGrid } from '../../../pipeline/世界/烘焙/可见.ts';

export const sectionSide = 34;
export const terrainPackDirs: Record<string, string> = { '主世界-116': '主世界-116/5c8a6378419e', '暮色放大-1752-扩展': '暮色放大-1752-扩展/c42d60d01992' };
export type SectionId = { L: number; i: number; j: number };
export type SectionItem = { file: string; off: number; len: number; id: SectionId };
export const sectionKey = (id: SectionId) => `${id.L}/${id.i}/${id.j}`;

export const load = async () => {
  const voxelLib = await loadVoxelLib();
  const loadModule = <T>(fileName: string) => import(pathToFileURL(path.join(codeRoot(), 'engine', 'voxel', fileName)).href) as Promise<T>;
  const [meshLib, importSectionLoaded] = await Promise.all([loadModule<typeof meshModule>('网格.ts'), loadModule<typeof importSectionModule>('导入区段.ts')]);
  return { 库: voxelLib, 网格: meshLib, importSectionLoaded };
};
export type TerrainVisEnv = Awaited<ReturnType<typeof load>>;

export type TerrainPack = {
  名: string; dir: string; 模型: SectionModel; info: PackageInfo; tables: PackTable;
  /** 第 L 级的区段，按块文件名、块内索引先后（和 wasm/实验/测地形.mjs 同一顺序，留出集才对得上） */
  级: SectionItem[][];
  lookup: Map<string, SectionItem>;
  stoneState: number;
  /** 色板号 → 是不是整格不透明（网格.ts 的 occlusionMask 第 0 位）；按状态号查 */
  stateFull: Uint8Array;
  /** 状态号 → 网格.ts 的挡面掩码：1 整格不透明、2 树叶、4 水这一层 */
  stateCover: Uint8Array;
  读: (s: SectionItem) => Buffer;
  decodeSection: (s: SectionItem) => SectionData;
  voxelContext: importSectionModule.SectionContext;
};

export const openPack = (env: TerrainVisEnv, terrainRoot: string, name: string): TerrainPack => {
  const dir = path.join(terrainRoot, terrainPackDirs[name]!);
  const sectionModel = readModel(fs.readFileSync(path.join(dir, '模型.bin')));
  const info = JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')) as PackageInfo;
  const { tileEntryCount, tileHeaderLen, buildPackTables } = env.库.sectionPack;
  const levels: SectionItem[][] = Array.from({ length: 7 }, () => []);
  const lookup = new Map<string, SectionItem>();
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
        const item = { file, off, len, id: { L, i: tx * edge + i, j: ty * edge + j } };
        levels[L]!.push(item);
        lookup.set(sectionKey(item.id), item);
      }
    }
    if (slot !== tileEntryCount) throw new Error('块索引项数对不上');
  }
  const tables = buildPackTables(info);
  const stoneState = info.状态.indexOf('minecraft:stone');
  if (stoneState < 0) throw new Error(`${name} 的状态表里没有 minecraft:stone`);
  const FULL = env.库.blockTable.blockProps.full;
  const stateFull = Uint8Array.from(info.状态, (_, s) => FULL[tables.值[s]!]!);
  if (!stateFull[stoneState]) throw new Error('石头不是整格不透明');
  const { leaf: LEAF, layer: CLS } = env.库.blockTable.blockProps;
  const stateCover = Uint8Array.from(info.状态, (_, s) => { const v = tables.值[s]!; return FULL[v]! | (LEAF[v]! << 1) | (CLS[v] === 3 ? 4 : 0); });
  const read = (s: SectionItem) => { const raw = Buffer.alloc(s.len); if (fs.readSync(fd(s.file), raw, 0, s.len, s.off) !== s.len) throw new Error('读短了'); return raw; };
  const voxelContext = { info, tables, variesByPos: info.群系.map(env.库.群系色.variesByPos), cutBoxes: [], flattenAreas: [] };
  return { 名: name, dir, 模型: sectionModel, info, tables, 级: levels, lookup, stoneState, stateFull, stateCover, 读: read, decodeSection: (s) => env.库.sectionDecoder.decodeSection(read(s), s.id, sectionModel), voxelContext };
};

/** 和 wasm/实验/测地形.mjs 同一个留出集：种子 31841，各 L 打乱后取前 min(⌊半数⌋, 96) 个测，接着最多 384 个训练。会打乱 包.级 */
export const holdoutSplit = (pack: TerrainPack) => {
  let seed = 31841;
  const shuffle = <T>(arr: T[]) => { for (let k = arr.length - 1; k > 0; k--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (k + 1); [arr[k], arr[j]] = [arr[j]!, arr[k]!]; } return arr; };
  const testSet: SectionItem[] = [], trainSet: SectionItem[] = [];
  for (const bin of pack.级) { shuffle(bin); const n = Math.min(Math.floor(bin.length / 2), 96); testSet.push(...bin.slice(0, n)); trainSet.push(...bin.slice(n, n + Math.min(384, bin.length - n))); }
  shuffle(testSet);
  return { 测: testSet, trainSet };
};

// 格子和四项变换用管线的正本（pipeline/世界/烘焙/可见.ts）；这里的 成格子 按原型的包结构取状态表、石头
export const makeCellGrid = (pack: TerrainPack, d: SectionData): CellGrid => pipelineToGrid(d, pack.stateFull, pack.stoneState);
/** 渲染那条路建网格（树叶第 0 级镂空、粗级实心） */
export const buildMesh = (env: TerrainVisEnv, pack: TerrainPack, g: CellGrid, solidLeaves = g.id.L >= 1): SectionMesh => env.网格.buildSectionMesh(env.importSectionLoaded.importedSectionVoxels(makeSection(g), pack.voxelContext), solidLeaves);

const arraysEqual = (a: Uint16Array, b: Uint16Array) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
/** 用现行编码器压，再用正式 WASM 解回逐格比（同 区段编码.ts 的 压并核对） */
export const compress = (env: TerrainVisEnv, d: SectionData, sectionModel: SectionModel): Uint8Array => {
  const cm = toColumnMajor(d), bytes = encodeSection(d, sectionModel, cm), decoded = env.库.sectionDecoder.decodeSection(bytes, d, sectionModel);
  if (decoded.kBottom !== d.kBottom || decoded.nz !== d.nz || !arraysEqual(decoded.palette, d.palette) || !arraysEqual(toColumnMajor(decoded), cm)) throw new Error(`区段 ${sectionKey(d)} 压完解回来不一样`);
  return bytes;
};

export const terrainRoot = () => path.join(dataRoot(), 'terrain');
