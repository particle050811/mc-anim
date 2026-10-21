// 渲染参数（全部显式传给 Remotion，并整份进指纹）。母版照旧项目 渲染带音频.py、批量渲染.mjs：
// h264-mkv、CRF 1、PCM 声音（Remotion 直出 mp4 时 AAC 预填充没写进编辑列表，声音会晚约一帧，所以先出 PCM 再由 ffmpeg 压），
// 视频级 PNG 帧、截图放大 2 倍出 2K；预览级 JPEG、不放大、inputProps 级别=预览。并发 1（用户 10-06 定）。
import { 配置 } from '../环境/配置.ts';
import { 规范化设置, type 渲染级别 } from '../../content/设置值.ts';

export const 等帧超时毫秒 = 10 * 60 * 1000; // 体素世界第一帧要建几十秒的区段，默认 30 秒不够；不影响画面，不进指纹

export const 渲染参数 = (级别: 渲染级别) => ({
  inputProps: 规范化设置({ 级别 }),
  codec: 'h264-mkv' as const,
  audioCodec: 'pcm-16' as const,
  crf: 1,
  x264Preset: 'veryfast' as const,
  imageFormat: 级别 === '预览' ? ('jpeg' as const) : ('png' as const),
  jpegQuality: 95,
  scale: 级别 === '预览' ? 1 : 2,
  gl: 配置('gl') as 'angle' | 'swangle' | 'egl' | 'swiftshader' | 'vulkan' | 'angle-egl',
  concurrency: 1,
  enforceAudioTrack: true,
});

export type 渲染参数表 = ReturnType<typeof 渲染参数>;
