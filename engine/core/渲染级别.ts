import { getRemotionEnvironment } from 'remotion';
import { renderInput } from './渲染设置.ts';
import { trialParams } from './试看.ts';

// 渲染级别：同一个 Composition、同一帧，按级别切换；三级画的是同一套真实方块的体素世界（lib/体素/），只差 `LevelParams`：
//   视频：成片用的级别，近处看得出一块块方块。
//   关键帧：只渲几张静帧给 AI 重绘成写实材质包画面，渲染量不限；细一级的门槛是视频级的一半。
//   预览：只给人看节奏、台词；方块早一级换粗、只画 6 公里（远处雾盖住），出 720p 不放大截图，
//     命令行 --props='{"level":"预览"}' 让各镜头默认的「视频」换成预览参数，镜头不用改（都写 `LevelParams.视频`）。
// `像素`：细一级的一格在输出画面上还有这么多像素就换细一级（Voxy hierarchical/screenspace.glsl 的做法）；
//   按输出像素算（页面 1280×720 × 截图倍数 `outputScale`），2K、4K 出片同一个门槛语义一样。11-17 以前按页面 CSS 像素算，数值是现在的 1/3。
//   `远`：最远画到多远（米）；`dpr`：对输出的超采样倍数。
// 视频级 `像素` 2.25（4K 上，= 页面 0.75；渲染距离 2 倍）：用户 10-03 嫌远处有分界线。页面 0.375（4K 上 1.125）远处更细，
//   但远景帧耗时近 2 倍、内存多一半，远山还冒出台阶摩尔纹，用户 10-14 比过后定不改（当时出 2K，比的是 2K 上 1.5 和 0.75）。
//   用户 11-17 要按 4K 算（「那难道现在还是 2K 算的吗 那肯定要改 4K」），默认值还没定：试看参数 `细分门槛`（输出像素）盖掉视频级的门槛，
//   REMOTION_ANIM_TRIAL='{"细分门槛": 1.5}' anim still …（engine/core/试看.ts），三档比较见 预览/1117-0349-细分门槛4K。
// 不改 Composition 宽高：页面变大，同一处方块在页面上的像素跟着变多，会切到细一级、几何和内存暴涨。
// 视频级不超采样（用户 10-07 定；2 倍治不了远山摩尔纹，试过）。摩尔纹改由 lib/体素/材质.ts 的 `台阶并色` 治；Voxy 也不超采样。
export type RenderLevel = '视频' | '关键帧' | '预览';
export type LevelParams = { pixel: number; far: number; dpr: number };
const videoLevel: LevelParams = { pixel: trialParams<number>('细分门槛') ?? 2.25, far: 24000, dpr: 1 };
const previewLevel: LevelParams = { pixel: 3, far: 6000, dpr: 1 };
const isPreview = (renderInput() as { level?: string }).level === '预览';
export const LevelParams: Record<RenderLevel, LevelParams> = {
  视频: isPreview ? previewLevel : videoLevel,
  关键帧: { pixel: 1.125, far: 24000, dpr: 1 },
  预览: previewLevel,
};

// 输出像素对页面 CSS 像素的倍数（截图放大）：渲染时就是 --scale（window.devicePixelRatio，4K 成片 3、预览级 1，pipeline/渲/设置.ts）。
// Studio 不放大截图，照成片的倍数算（视频级按 4K 的 3 倍），地形分级和出片一样。
export const outputScale = () => (getRemotionEnvironment().isRendering ? window.devicePixelRatio || 1 : isPreview ? 1 : 3);

// ThreeCanvas 的 dpr（画布对页面的倍数）= 超采样 × 截图放大。渲染时 window.devicePixelRatio 就是 --scale；
// Studio 预览不乘（视网膜屏 devicePixelRatio 是 2，会平白多画 4 倍）。
// 命令行 --props='{"supersample":1}' 盖掉各级的超采样。
export const canvasDpr = (supersample: number) => {
  const override = (renderInput() as { supersample?: number }).supersample;
  return (typeof override === 'number' ? override : supersample) * (getRemotionEnvironment().isRendering ? window.devicePixelRatio || 1 : 1);
};
