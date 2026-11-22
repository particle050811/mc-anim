// 这一页读过哪些地形包和区段，挂在 window 上，pipeline/渲/地形用量.ts 关页面前收走，累积进 <数据根>/run/地形用量/。只记不读，不影响画面。
// 用途：收窄段声明的包；以后改包时只比这些区段。渲染入口传了段名才记（Studio、Node 工具不记）。
import { terrainUsageSegEnv } from '../段/地形环境.ts';

type PackUsage = { version: string; sections: Set<string> };
const globals = globalThis as { terrainUsage?: Map<string, PackUsage>; process?: { env?: Record<string, string | undefined> } };
const getUsageMap = () => (globals.terrainUsage ??= new Map());
const isRecording = () => Boolean(globals.process?.env?.[terrainUsageSegEnv]);
export const recordPackRead = (pack: string, version: string) => {
  if (!isRecording()) return;
  if (!getUsageMap().has(pack)) getUsageMap().set(pack, { version: version, sections: new Set() });
};

/** 区段键是 engine/voxel/区段.ts 的 sectionKey。包一定先经 packDir 记过 */
export const recordSectionRead = (pack: string, sectionKeys: readonly string[]) => {
  if (!isRecording()) return;
  const thisPack = getUsageMap().get(pack);
  if (!thisPack) throw new Error(`地形用量：区段先于包 ${pack} 记下，取包要经 packDir`);
  for (const k of sectionKeys) thisPack.sections.add(k);
};
