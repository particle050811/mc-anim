// anim world 用到的 engine/voxel 模块：区段包格式（区段包.ts、区段.ts、区段解码.ts）、合并规则（生成.ts）、方块表（真实方块表.ts）、群系抖动（群系色.ts）。
// 格式和规则只有 engine 里那一份，这里不抄。它们 import 了 asset:（方块表、群系色 JSON），Node 里要先注册 资产/node资产钩子.ts 才执行得了，
// 所以按路径动态 import（静态 import 会在注册前就解析）；类型照常静态引，tsc 照查。
// 这几个模块的闭包不许有 react、three、remotion（存档.test.ts 的「体素库」用 esbuild 守）。
import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { codeRoot } from '../环境/路径.ts';
import { assetJsonTable } from '../资产/node资产.ts';
import type * as sectionPackModule from '../../engine/voxel/区段包.ts';
import type * as sectionModule from '../../engine/voxel/区段.ts';
import type * as sectionDecodeModule from '../../engine/voxel/区段解码.ts';
import type * as generateModule from '../../engine/voxel/生成.ts';
import type * as biomeColorModule from '../../engine/voxel/群系色.ts';
import type * as blockTableModule from '../../engine/voxel/真实方块表.ts';

import type * as distantModule from '../../engine/voxel/远景.ts';
import type * as samplerModule from '../../engine/voxel/远景兜底采样.ts';
import type * as importedModule from '../../engine/voxel/导入区段.ts';

import type * as mergeModule from '../../engine/voxel/远景并列.ts';
import type * as noiseModule from '../../engine/core/噪声.ts';
import type * as gridModule from '../../engine/voxel/远景网格.ts';

export const VOXEL_MODULES = ['区段包.ts', '区段.ts', '区段解码.ts', '生成.ts', '群系色.ts', '真实方块表.ts'] as const;
export const FAR_MODULES = ['远景.ts', '导入区段.ts', '远景兜底采样.ts', '远景并列.ts', '../core/噪声.ts', '远景网格.ts'] as const;

/** 烘焙和编辑校验要的方块知识；测试里可以换成小表 */
export type BlockKnowledge = {
  voxelValue: (blockState: string) => number;
  biomeNames: readonly string[];
  tint: Uint8Array;
  opaque: Uint8Array;
  full: Uint8Array;
  /** 自发光 0～255（engine/voxel/方块发光.ts）；测试的小表可以不给 = 都不发光 */
  glow?: Uint8Array;
  mergeKey: (op: number, L: number, lx: number, ly: number, lz: number, prio: number) => number;
  biomeScaleSeed: (seed: string) => Promise<bigint>;
  biomeCell: (scaleSeed: bigint, x: number, y: number, z: number) => [number, number, number];
  /** 方块表里有的全部状态（方块表.json 的键） */
  allStates: readonly string[];
};

export type VoxelLib = { sectionPack: typeof sectionPackModule; sections: typeof sectionModule; sectionDecoder: typeof sectionDecodeModule; generated: typeof generateModule; biomeColor: typeof biomeColorModule; blockTable: typeof blockTableModule; knowledge: BlockKnowledge };

const ASSET_HOOK_MARK = Symbol.for('mc-anim.node资产钩子');
export const registerAssetHook = () => {
  const g = globalThis as { [ASSET_HOOK_MARK]?: true };
  if (g[ASSET_HOOK_MARK]) return;
  g[ASSET_HOOK_MARK] = true;
  register('../资产/node资产钩子.ts', { parentURL: import.meta.url, data: { 表: assetJsonTable() } });
};

const loadModule = <T>(moduleName: (typeof VOXEL_MODULES | typeof FAR_MODULES)[number]) => import(pathToFileURL(path.join(codeRoot(), 'engine', 'voxel', moduleName)).href) as Promise<T>;

let voxelLibCache: Promise<VoxelLib> | undefined;
export const loadVoxelLib = () =>
  (voxelLibCache ??= (async () => {
    registerAssetHook();
    const [sectionPack, section, sectionDecoder, generator, biomeColor, blockTable] = await Promise.all([loadModule<typeof sectionPackModule>('区段包.ts'), loadModule<typeof sectionModule>('区段.ts'), loadModule<typeof sectionDecodeModule>('区段解码.ts'), loadModule<typeof generateModule>('生成.ts'), loadModule<typeof biomeColorModule>('群系色.ts'), loadModule<typeof blockTableModule>('真实方块表.ts')]);
    const knowledge: BlockKnowledge = {
      voxelValue: blockTable.voxelFromState,
      biomeNames: blockTable.biomeNames,
      tint: blockTable.blockProps.tint,
      opaque: blockTable.blockProps.opaque,
      full: blockTable.blockProps.full,
      glow: blockTable.blockProps.glow,
      mergeKey: generator.mergeKey,
      biomeScaleSeed: (s) => biomeColor.biomeZoomSeed(s),
      biomeCell: biomeColor.biomeCell,
      allStates: blockTable.blockNames,
    };
    return { sectionPack, sections: section, sectionDecoder, generated: generator, biomeColor: biomeColor, blockTable, knowledge };
  })());

/** 作品覆盖层只改底包的体素，不依赖远景网格和采样器。 */
export const loadImportedVoxelLib = async () => {
  const lib = await loadVoxelLib();
  return { ...lib, imported: await loadModule<typeof importedModule>('导入区段.ts') };
};

// 普通存档的导入、转码不需要远景海底和草花的资产。
export const loadFarVoxelLib = async () => {
  const lib = await loadVoxelLib();
  const [distant, imported, sampler, merge] = await Promise.all([loadModule<typeof distantModule>('远景.ts'), loadModule<typeof importedModule>('导入区段.ts'), loadModule<typeof samplerModule>('远景兜底采样.ts'), loadModule<typeof mergeModule>('远景并列.ts')]);
  const [{ hash2 }, { distantPoint }] = await Promise.all([loadModule<typeof noiseModule>('../core/噪声.ts'), loadModule<typeof gridModule>('远景网格.ts')]);
  return { ...lib, distant, imported, sampler, merge, hash2, distantPoint };
};
export type FarVoxelLib = Awaited<ReturnType<typeof loadFarVoxelLib>>;
