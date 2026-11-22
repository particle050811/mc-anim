// 段的地形视图：每一帧有哪几块画布挂着体素世界、各从哪个机位、按什么参数挑区段。
// 画面组件照它摆相机、给 VoxelWorld 传参数；加载计划（加载计划.ts）在 Node 里照它逐帧调 prepareSelection（选区段.ts）。
// 两边读同一份，算出来的区段才一定和渲染时要的一样。只放纯数据和纯函数，不碰 React、three 的场景。
import type * as THREE from 'three';
import type { DataSource } from '../core/数据读取.ts';
import type { SeqClock } from '../core/拼段时序.ts';
import type { V3 } from '../model/parts.tsx';
import type { SectionId } from './区段.ts';
import type { Lookahead, SelectionSource } from './选区段.ts';

/** 加载计划开的地形：选级要的那份地形源，和挑出来的区段记到哪几个包 */
export type PlanWorld = {
  source: SelectionSource;
  heightRange: [number, number];
  /** 体素世界这一帧挑出来的（同 地形源的 prefetch 在地形覆盖时记的） */
  reads: (list: SectionId[]) => [string, string[]][];
  /** 旁路读者（光体）要的（同 导入地形.ts 的 sectionData） */
  bypassReads: (qs: SectionId[]) => [string, string[]][];
};
/** dirOf：包名 → 版本目录（数据源里的相对路径，如 terrain/主世界-116/<版本>） */
export type TerrainWorld = { key: string; open: (src: DataSource, dirOf: (pack: string) => string) => Promise<PlanWorld> };

export type TerrainCanvasView = {
  canvas: string; // 画布名：同一帧几块画布时区分，航线定级表按画布留
  world: TerrainWorld;
  /** 把这一帧的机位摆进相机（aspect = 画幅宽高比），返回镜头位置（VoxelWorld 的 center） */
  place: (camera: THREE.PerspectiveCamera, aspect: number) => number[];
  farM: number; // VoxelWorld 的 far
  pixel: number; // VoxelWorld 的 pixel（输出像素）
  heightRange?: [number, number]; // 不给用地形源的
  shadowLightDir?: V3;
  look?: Lookahead; // 镜头登记的航线（useLookahead；secLeft、secSinceStart 取画布所在那一层的 SeqClock）
  /** 挂着体素地形的光体（engine/light/光体组件.tsx 的 LightVolume，开着光体参数时）：同它的 center、heightRange */
  light?: { center: readonly number[]; heightRange: readonly [number, number] };
};

export type TerrainViewDecl = {
  width: number; // 页面 CSS 像素，同 段.ts
  height: number;
  /** 段内第 sec 秒挂着体素世界的画布；没有就是 []。clock：这一帧在段这一层的时钟，拼段的用 拼段时序.ts 的 clockInStitch 换成截里的 */
  at: (sec: number, clock: SeqClock) => TerrainCanvasView[];
};

export const defineTerrainView = (decl: TerrainViewDecl) => decl;
