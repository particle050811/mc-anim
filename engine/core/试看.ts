// 试看参数：用户还没定的画面改动先做成参数，打开了给用户挑，不改默认值、不进指纹（同 --shading 的做法，pipeline/渲/光影试看.ts）。
// 有哪些名字、值怎么写、落在哪：`anim trial list`（登记表 engine/core/调试开关.ts；新名字先登记，没登记的 trialParams 直接报错）。
// 用法：shell 里设 REMOTION_ANIM_TRIAL='{"<名>": …}' 再跑 anim still、bench 或 film，它们原样转给页面；still 还能 --trial '<JSON>' 一次给几组（pipeline/渲/试看组.ts）。
// film 设了它只出试看片（pipeline/出片/试看.ts）：编码同切片、能和成片对比（用户 11-17 定：试看对比视频走正规编码），但不写切片、不碰段签和交付。
// 没设或没有这个名字时返回 undefined，代码照现状走。页面在开页时拿到环境变量、模块求值时就读，一页只认一组。
import { findSwitch, type OffName, type TrialName } from './调试开关.ts';

export const trialEnvName = 'REMOTION_ANIM_TRIAL';

// webpack 里没有 process 这个变量时也不能炸（同 engine/voxel/区段包位置.ts）
const readProcessEnv = () => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

let lastRawText: string | undefined;
let lastTable: Record<string, unknown> = {};
export const trialParams = <T>(paramName: TrialName): T | undefined => {
  if (!findSwitch('trial', paramName)) throw new Error(`试看名「${paramName}」没登记（engine/core/调试开关.ts）`);
  const raw = readProcessEnv()?.[trialEnvName];
  if (!raw) return undefined;
  if (raw !== lastRawText) {
    lastTable = JSON.parse(raw) as Record<string, unknown>;
    lastRawText = raw;
  }
  return lastTable[paramName] as T | undefined;
};

/** 标准消融：试看 {"关": [...]} 里写了这一项没有。没设时 false，代码照现状走 */
export const trialOff = (item: OffName): boolean => {
  if (!findSwitch('off', item)) throw new Error(`「关」的项「${item}」没登记（engine/core/调试开关.ts）`);
  const list = trialParams<string[]>('关');
  return Array.isArray(list) && list.includes(item);
};
