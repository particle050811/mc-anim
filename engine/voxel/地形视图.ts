// 段的地形视图：每一帧有哪几块画布挂着体素世界、各从哪个机位、按什么参数挑区段。
// 画面组件照它摆相机、给 VoxelWorld 传参数；加载计划（加载计划.ts）在 Node 里照它逐帧调 prepareSelection（选区段.ts）。
// 两边读同一份，算出来的区段才一定和渲染时要的一样。只放纯数据和纯函数，不碰 React、three 的场景。
import type * as THREE from 'three';
import type { V3 } from '../model/parts.tsx';

/** 体素世界读哪个地形：主世界 = 区段包 + 导入范围外的远景网格兜底（主世界地形.ts） */
export type TerrainWorld = { kind: '主世界'; pack: string; distant: string };

export type TerrainCanvasView = {
  canvas: string; // 画布名：同一帧几块画布时区分，航线定级表按画布留
  world: TerrainWorld;
  /** 把这一帧的机位摆进相机（aspect = 画幅宽高比），返回镜头位置（VoxelWorld 的 center） */
  place: (camera: THREE.PerspectiveCamera, aspect: number) => number[];
  farM: number; // VoxelWorld 的 far
  pixel: number; // VoxelWorld 的 pixel（输出像素）
  heightRange?: [number, number]; // 不给用地形源的
  shadowLightDir?: V3;
};

export type TerrainViewDecl = {
  width: number; // 页面 CSS 像素，同 段.ts
  height: number;
  /** 段内第 sec 秒挂着体素世界的画布；没有就是 [] */
  at: (sec: number) => TerrainCanvasView[];
};

export const defineTerrainView = (decl: TerrainViewDecl) => decl;
