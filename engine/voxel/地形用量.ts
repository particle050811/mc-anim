// 这一页读过哪些地形包和区段，挂在 window 上，pipeline/渲/地形用量.ts 关页面前收走，累积进 <数据根>/run/地形用量/。只记不读，不影响画面。
// 用途：收窄段声明的包；以后改包时只比这些区段。渲染入口传了段名才记（Studio、Node 工具不记）。
// 地形覆盖（给了 terrainCoverEnv，pipeline/渲/地形覆盖.ts）另记每个区段头一次用到是整段第几帧（window.terrainCoverFirst），check 列缺级时报帧号；
// 和体素世界从哪些包挑过区段（window.terrainCoverWorlds）：挑过却一个区段没记下，pipeline 当量错了报错，不拿空覆盖去裁包。
import { terrainUsageSegEnv, terrainCoverEnv } from '../段/地形环境.ts';

type PackUsage = { version: string; sections: Set<string> };
const globals = globalThis as { terrainUsage?: Map<string, PackUsage>; terrainCoverFirst?: Map<string, Map<string, number>>; terrainCoverWorlds?: Set<string>; terrainCoverFrame?: number; process?: { env?: Record<string, string | undefined> } };
const getUsageMap = () => (globals.terrainUsage ??= new Map());
const isRecording = () => Boolean(globals.process?.env?.[terrainUsageSegEnv]);
/** 这一页是地形覆盖：体素世界只挑区段、记下来，不取、不建、不画 */
export const isCoverRun = () => Boolean(globals.process?.env?.[terrainCoverEnv]);
/** 覆盖时体素世界每次渲染报一次整段帧号，之后记的区段算在这一帧头上 */
export const setCoverFrame = (frame: number) => {
  globals.terrainCoverFrame = frame;
};

/** 覆盖时体素世界这一帧从这个包挑区段（挑出 0 个也报）：判断「画面里有体素世界读这个包」的依据 */
export const noteCoverWorld = (pack: string) => {
  if (isCoverRun()) (globals.terrainCoverWorlds ??= new Set()).add(pack);
};

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
  if (!isCoverRun()) return;
  const firstUse = (globals.terrainCoverFirst ??= new Map()).get(pack) ?? new Map<string, number>();
  globals.terrainCoverFirst.set(pack, firstUse);
  const frame = globals.terrainCoverFrame ?? 0;
  for (const k of sectionKeys) if (!(firstUse.get(k)! <= frame)) firstUse.set(k, frame);
};
