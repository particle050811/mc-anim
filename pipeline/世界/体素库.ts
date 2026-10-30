// anim world 用到的 engine/voxel 模块：区段包格式（区段包.ts、区段.ts）、合并规则（生成.ts）、方块表（真实方块表.ts）、群系抖动（群系色.ts）。
// 格式和规则只有 engine 里那一份，这里不抄。它们 import 了 asset:（方块表、群系色 JSON），Node 里要先注册 资产/node资产钩子.ts 才执行得了，
// 所以按路径动态 import（静态 import 会在注册前就解析）；类型照常静态引，tsc 照查。
// 这几个模块的闭包不许有 react、three、remotion（体素库.test.ts 用 esbuild 守）。
import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { 代码根 } from '../环境/路径.ts';
import { 资产json表 } from '../资产/node资产.ts';
import type * as 区段包模块 from '../../engine/voxel/区段包.ts';
import type * as 区段模块 from '../../engine/voxel/区段.ts';
import type * as 生成模块 from '../../engine/voxel/生成.ts';
import type * as 群系色模块 from '../../engine/voxel/群系色.ts';
import type * as 方块表模块 from '../../engine/voxel/真实方块表.ts';

export const 体素模块 = ['区段包.ts', '区段.ts', '生成.ts', '群系色.ts', '真实方块表.ts'] as const;

/** 烘焙和编辑校验要的方块知识；测试里可以换成小表 */
export type 方块知识 = {
  体素值: (状态: string) => number;
  群系名: readonly string[];
  染: Uint8Array;
  不透明: Uint8Array;
  满: Uint8Array;
  合并键: (op: number, L: number, lx: number, ly: number, lz: number, prio: number) => number;
  群系缩放种子: (种子: string) => Promise<bigint>;
  群系格: (缩放种子: bigint, x: number, y: number, z: number) => [number, number, number];
  /** 方块表里有的全部状态（方块表.json 的键） */
  全部状态: readonly string[];
};

export type 体素库 = { 区段包: typeof 区段包模块; 区段: typeof 区段模块; 生成: typeof 生成模块; 群系色: typeof 群系色模块; 方块表: typeof 方块表模块; 知识: 方块知识 };

const 标记 = Symbol.for('mc-anim.node资产钩子');
export const 注册资产钩子 = () => {
  const g = globalThis as { [标记]?: true };
  if (g[标记]) return;
  g[标记] = true;
  register('../资产/node资产钩子.ts', { parentURL: import.meta.url, data: { 表: 资产json表() } });
};

let 缓存: Promise<体素库> | undefined;
export const 载入体素库 = () =>
  (缓存 ??= (async () => {
    注册资产钩子();
    const 载 = <T>(名: (typeof 体素模块)[number]) => import(pathToFileURL(path.join(代码根(), 'engine', 'voxel', 名)).href) as Promise<T>;
    const [区段包, 区段, 生成, 群系色, 方块表] = await Promise.all([载<typeof 区段包模块>('区段包.ts'), 载<typeof 区段模块>('区段.ts'), 载<typeof 生成模块>('生成.ts'), 载<typeof 群系色模块>('群系色.ts'), 载<typeof 方块表模块>('真实方块表.ts')]);
    const 知识: 方块知识 = {
      体素值: 方块表.voxelFromState,
      群系名: 方块表.biomeNames,
      染: 方块表.blockProps.tint,
      不透明: 方块表.blockProps.opaque,
      满: 方块表.blockProps.full,
      合并键: 生成.mergeKey,
      群系缩放种子: (s) => 群系色.biomeZoomSeed(s),
      群系格: 群系色.biomeCell,
      全部状态: 方块表.blockNames,
    };
    return { 区段包, 区段, 生成, 群系色, 方块表, 知识 };
  })());
