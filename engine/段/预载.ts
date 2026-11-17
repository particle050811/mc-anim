// 读组合的页面要预载哪几段的画面模块（JSON 段键数组），注册工厂.tsx 读，pipeline/渲/渲.ts、测速.ts 读组合时经 envVariables 传。纯模块。
// 用途：模块初始化里缺的求解在读组合那一页（闸外）算好，出帧的页面直接读缓存；出帧的页面不传。
export const preloadSegsEnv = 'ANIM_PRELOAD_SEGS';

/** 读组合时传给页面的环境变量 */
export const preloadEnv = (segKeys: readonly string[] | undefined): Record<string, string> => (segKeys?.length ? { [preloadSegsEnv]: JSON.stringify(segKeys) } : {});
