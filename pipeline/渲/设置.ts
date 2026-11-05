// 渲染参数（全部显式传给 Remotion，并整份进指纹）。母版照旧项目 渲染带音频.py、批量渲染.mjs：
// h264-mkv、CRF 1、PCM 声音（Remotion 直出 mp4 时 AAC 预填充没写进编辑列表，声音会晚约一帧，所以先出 PCM 再由 ffmpeg 压），
// 视频级 PNG 帧、截图按成片档放大（1080p 档 2 倍出 2560×1440，4k 档 3 倍出 3840×2160）；预览级 JPEG、不放大、inputProps 级别=预览。并发 1（用户 10-06 定）。
import { 配置 } from '../环境/配置.ts';
import { 规范化设置, type 渲染级别 } from '../../engine/段/设置值.ts';

/**
 * 成片档（用户 11-04 定：B 站是主要平台，成片按它的 1080P60 出；4K 做成改一项设置 ANIM_FILM_PROFILE=4k 就能出）。
 * 渲染倍数是截图放大倍数，进指纹：1080p 档照旧 2 倍渲 2560×1440 母版（指纹和以前一样，不重渲），合成时缩到 1920×1080；
 * 4k 档 3 倍（1280×3 正好 3840），母版指纹全变、要整片重渲，认可参考还是 1440 的，verify 比不了。
 * 码率上限照 B 站投稿规格（1080P 平均 6000 kbps、4K 20000 kbps；出自 UP 主整理帖，不是官方文档）留约 3% 余量，超了 B 站会多压一遍
 */
export const 成片档表 = {
  '1080p': { 渲染倍数: 2, 宽: 1920, 高: 1080, 码率上限kbps: 5800 },
  '4k': { 渲染倍数: 3, 宽: 3840, 高: 2160, 码率上限kbps: 19400 },
} as const;
export type 成片档名 = keyof typeof 成片档表;
export const 成片档 = () => {
  const 名 = 配置('成片档');
  if (!(名 in 成片档表)) throw new Error(`成片档 ${名} 不认识，只能是 ${Object.keys(成片档表).join('、')}（ANIM_FILM_PROFILE）`);
  return { 名: 名 as 成片档名, ...成片档表[名 as 成片档名] };
};
/** 母版、叠层的宽高（视频级 = 页面 1280×720 × 渲染倍数；预览级不放大） */
export const 母版宽高 = (级别: 渲染级别): [number, number] => {
  const 倍 = 级别 === '预览' ? 1 : 成片档().渲染倍数;
  return [1280 * 倍, 720 * 倍];
};

export const 等帧超时毫秒 = 10 * 60 * 1000; // 体素世界第一帧要建几十秒的区段，默认 30 秒不够；不影响画面，不进指纹

export const 渲染参数 = (级别: 渲染级别) => ({
  inputProps: 规范化设置({ 级别 }),
  codec: 'h264-mkv' as const,
  audioCodec: 'pcm-16' as const,
  crf: 1,
  x264Preset: 'veryfast' as const,
  imageFormat: 级别 === '预览' ? ('jpeg' as const) : ('png' as const),
  jpegQuality: 95,
  scale: 级别 === '预览' ? 1 : 成片档().渲染倍数,
  gl: 配置('gl') as 'angle' | 'swangle' | 'egl' | 'swiftshader' | 'vulkan' | 'angle-egl',
  concurrency: 1,
  enforceAudioTrack: true,
});

export type 渲染参数表 = ReturnType<typeof 渲染参数>;

// 透明叠层：照旧项目 透明层.py 出 ProRes 4444（yuva444p10le，带透明），PNG 帧、和母版一样放大（成片档的渲染倍数，预览 1 倍），不带声音
export const 叠层渲染参数 = (级别: 渲染级别) => ({
  inputProps: 规范化设置({ 级别 }),
  codec: 'prores' as const,
  proResProfile: '4444' as const,
  pixelFormat: 'yuva444p10le' as const,
  imageFormat: 'png' as const,
  scale: 级别 === '预览' ? 1 : 成片档().渲染倍数,
  gl: 配置('gl') as 'angle' | 'swangle' | 'egl' | 'swiftshader' | 'vulkan' | 'angle-egl',
  concurrency: 1,
  muted: true,
});
