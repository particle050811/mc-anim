// 渲染入口和页面之间传地形信息用的环境变量名。纯模块：pipeline（pipeline/渲/地形注入.ts、Studio）和 engine/voxel 都引这一份。
/** 这一页能读的包 → 版本（JSON）。REMOTION_ 开头 Studio 才转给页面，render、still 走 envVariables 用同一个名字 */
export const 地形版本环境名 = 'REMOTION_ANIM_TERRAIN_PACKS';
/** <作品>/<段键>：给了才记地形用量（engine/voxel/地形用量.ts），pipeline 关页面前按它落到 run/地形用量/ */
export const 地形用量段环境名 = 'ANIM_TERRAIN_USAGE_SEG';
