// 这一页读过哪些地形包和区段，挂在 window 上，pipeline/渲/地形用量.ts 关页面前收走，累积进 <数据根>/run/地形用量/。只记不读，不影响画面。
// 用途：收窄段声明的包；以后改包时只比这些区段。渲染入口传了段名才记（Studio、Node 工具不记）。
import { 地形用量段环境名 } from '../段/地形环境.ts';

type 一包 = { 版本: string; 区段: Set<string> };
const 全局 = globalThis as { __地形用量?: Map<string, 一包>; process?: { env?: Record<string, string | undefined> } };
const 表 = () => (全局.__地形用量 ??= new Map());
const 在记 = () => Boolean(全局.process?.env?.[地形用量段环境名]);

export const 记读包 = (包: string, 版本: string) => {
  if (!在记()) return;
  if (!表().has(包)) 表().set(包, { 版本, 区段: new Set() });
};

/** 区段键是 engine/voxel/区段.ts 的 sectionKey。包一定先经 packDir 记过 */
export const 记读区段 = (包: string, 区段键们: readonly string[]) => {
  if (!在记()) return;
  const 这包 = 表().get(包);
  if (!这包) throw new Error(`地形用量：区段先于包 ${包} 记下，取包要经 packDir`);
  for (const k of 区段键们) 这包.区段.add(k);
};
