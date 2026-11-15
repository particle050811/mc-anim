// 试看参数：用户还没定的画面改动先做成参数，只在 anim still 时打开给用户挑，不改默认值、不进指纹（同 --光影 的做法，pipeline/渲/光影试看.ts）。
// 用法：shell 里设 REMOTION_ANIM_TRIAL='{"<名>": {...}, "地形": ["<要多读的包>"]}' 再跑 anim still；still 把它原样转给页面，
// 「地形」里的包按 assets/地形版本.json 现登记的版本并进这一页的地形版本表（pipeline/渲/渲.ts）。film 不转，切片不会混进试看的画面。
// 没设或没有这个名字时返回 undefined，代码照现状走。
export const trialEnvName = 'REMOTION_ANIM_TRIAL';

// webpack 里没有 process 这个变量时也不能炸（同 engine/voxel/区段包位置.ts）
const readProcessEnv = () => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

let lastRawText: string | undefined;
let lastTable: Record<string, unknown> = {};
export const trialParams = <T>(paramName: string): T | undefined => {
  const raw = readProcessEnv()?.[trialEnvName];
  if (!raw) return undefined;
  if (raw !== lastRawText) {
    lastTable = JSON.parse(raw) as Record<string, unknown>;
    lastRawText = raw;
  }
  return lastTable[paramName] as T | undefined;
};
