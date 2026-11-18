// 渲染入口和页面之间传地形信息（含光体缓存）用的环境变量名。纯模块：pipeline（pipeline/渲/地形注入.ts、Studio）和 engine/voxel 都引这一份。
/** 这一页能读的包 → 版本（JSON）。REMOTION_ 开头 Studio 才转给页面，render、still 走 envVariables 用同一个名字 */
export const terrainVersionEnv = 'REMOTION_ANIM_TERRAIN_PACKS';
/** 网格和区段包是两种格式，不能像同一包的完整、裁级版本那样只换目录；读法随本页版本表一起传。 */
export const terrainReadModeEnv = 'REMOTION_ANIM_TERRAIN_READ_MODE';
/** <作品>/<段键>：给了才记地形用量（engine/voxel/地形用量.ts），pipeline 关页面前按它落到 run/地形用量/ */
export const terrainUsageSegEnv = 'ANIM_TERRAIN_USAGE_SEG';
/** 光体缓存目录 <数据根>/cache/光体/<作品>/ 里开页时已有的文件名（JSON 数组）：页面只取列着的，冷缓存不 fetch 出 404（engine/light/光体缓存读写.ts） */
export const lightCacheFilesEnv = 'ANIM_LIGHT_CACHE_FILES';
/** 地形覆盖（pipeline/渲/地形覆盖.ts）：给了就只挑区段、记下来，不取不建不画（engine/voxel/世界.tsx）；记的是哪一帧头一次用到哪个区段 */
export const terrainCoverEnv = 'ANIM_TERRAIN_COVER';
