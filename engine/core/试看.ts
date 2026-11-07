// 试看参数：用户还没定的画面改动先做成参数，只在 anim still 时打开给用户挑，不改默认值、不进指纹（同 --光影 的做法，pipeline/渲/光影试看.ts）。
// 用法：shell 里设 REMOTION_ANIM_TRIAL='{"<名>": {...}, "地形": ["<要多读的包>"]}' 再跑 anim still；still 把它原样转给页面，
// 「地形」里的包按 assets/地形版本.json 现登记的版本并进这一页的地形版本表（pipeline/渲/渲.ts）。film 不转，切片不会混进试看的画面。
// 没设或没有这个名字时返回 undefined，代码照现状走。
export const 试看环境名 = 'REMOTION_ANIM_TRIAL';

// webpack 里没有 process 这个变量时也不能炸（同 engine/voxel/区段包位置.ts）
const 环境 = () => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

let 上次原文: string | undefined;
let 上次表: Record<string, unknown> = {};
export const 试看参数 = <T>(名: string): T | undefined => {
  const 原文 = 环境()?.[试看环境名];
  if (!原文) return undefined;
  if (原文 !== 上次原文) {
    上次表 = JSON.parse(原文) as Record<string, unknown>;
    上次原文 = 原文;
  }
  return 上次表[名] as T | undefined;
};
