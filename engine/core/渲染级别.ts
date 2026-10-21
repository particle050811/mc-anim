import { getRemotionEnvironment } from 'remotion';
import { 渲染输入 } from './渲染设置.ts';

// 渲染级别：同一个 Composition、同一帧，按级别切换；三级画的是同一套真实方块的体素世界（lib/体素/），只差 `LevelParams`：
//   视频：成片用的级别，近处看得出一块块方块。
//   关键帧：只渲几张静帧给 AI 重绘成写实材质包画面，渲染量不限；配 --scale=4（画布 dpr 4，细一级的门槛是视频级的 1/4，输出图上一格的像素数和视频级一样）。
//   预览：只给人看节奏、台词；方块早一级换粗、只画 6 公里（远处雾盖住），渲染脚本配 --预览 出 720p（见 工具/渲染带音频.py），
//     命令行 --props='{"级别":"预览"}' 让各镜头默认的「视频」换成预览参数，镜头不用改（都写 `LevelParams.视频`）。
// `像素`：细一级的一格在画面上还有这么多 CSS 像素（1280×720 画面）就换细一级（Voxy hierarchical/screenspace.glsl 的做法）；
//   `远`：最远画到多远（米）；`dpr`：对输出的超采样倍数。
// 6-1-4-关键帧 传「关键帧」，其余默认「视频」。
// 视频级 `像素` 0.75（渲染距离 2 倍）：用户 10-03 嫌远处有分界线。0.375 远处更细，但远景帧耗时近 2 倍、内存多一半，
//   远山还冒出台阶摩尔纹，用户 10-14 比过后定不改。
// 参考视频统一出 2K（用户 10-07 定）：工具/渲染带音频.py 带 --scale=2，页面仍是 1280×720、截图放大 2 倍；`像素` 门槛按页面高度算，
//   --scale 不改它。改 Composition 宽高会让远处方块切到细一级、几何和内存暴涨，所以不改宽高。
// 视频级不超采样（用户 10-07 定；2 倍治不了远山摩尔纹，试过）。摩尔纹改由 lib/体素/材质.ts 的 `台阶并色` 治；Voxy 也不超采样。
export type RenderLevel = '视频' | '关键帧' | '预览';
export type LevelParams = { 像素: number; 远: number; dpr: number };
const videoLevel: LevelParams = { 像素: 0.75, 远: 24000, dpr: 1 };
const previewLevel: LevelParams = { 像素: 3, 远: 6000, dpr: 1 };
const isPreview = (渲染输入() as { 级别?: string }).级别 === '预览';
export const LevelParams: Record<RenderLevel, LevelParams> = {
  视频: isPreview ? previewLevel : videoLevel,
  关键帧: { 像素: 0.375, 远: 24000, dpr: 1 },
  预览: previewLevel,
};

// ThreeCanvas 的 dpr（画布对页面的倍数）= 超采样 × 截图放大。渲染时 window.devicePixelRatio 就是 --scale；
// Studio 预览不乘（视网膜屏 devicePixelRatio 是 2，会平白多画 4 倍）。
// 命令行 --props='{"supersample":1}' 盖掉各级的超采样。
export const canvasDpr = (supersample: number) => {
  const override = (渲染输入() as { supersample?: number }).supersample;
  return (typeof override === 'number' ? override : supersample) * (getRemotionEnvironment().isRendering ? window.devicePixelRatio || 1 : 1);
};
