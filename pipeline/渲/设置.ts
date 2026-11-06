// 渲染参数（全部显式传给 Remotion，并整份进指纹）。每段渲出来就是成片的一截（用户 11-05 定「母版 = 成片切片」）：
// 叠层、字幕画在段里，Remotion 直接按成片参数压（x264 medium CRF 18 + 码率上限、BT.709），成片只接不重压；不带声音，声音另出一遍（声音渲染参数）。
// 视频级 PNG 帧、截图按成片档放大；预览级 JPEG、不放大、inputProps 级别=预览。并发 1（用户 10-06 定）。
import { 配置 } from '../环境/配置.ts';
import { 规范化设置, type 段字幕, type 渲染级别 } from '../../engine/段/设置值.ts';

/**
 * 成片档：默认 4K60（用户 11-05 定「默认 4K60」，1080P60 只是可选项，ANIM_FILM_PROFILE=1080p60）。帧率是输出帧率，段.ts 的 fps 是编排帧率（engine/段/出帧.ts）。
 * 码率上限是 x264 的 VBV（缓冲快满时提 QP，不是硬截）：4K 40 Mbps（用户 11-05 定「用 40mbps 稍微高点」，B 站 4K 档约 16 Mbps）；
 * 1080P60 按 11-05 实测每帧 250 kbit 够 B 站二压不掉画质，取 15 Mbps（用户没单独点这个数）。缓冲都是上限的 2 倍。
 * 渲染倍数是截图放大倍数，进指纹；母版就是成片的分辨率，合成不再缩放（用户 11-04「还是用原生的 1080P 而不是重新压缩 不要给未来留技术债务」，11-05 再定「母版分辨率肯定要改成和发布版一致的」）。
 * 1080p 1.5 倍（11-05 以前是 2 倍出 2560×1440，那些母版、认可参考都是 1440 的），4k 3 倍；换档母版全部重渲。
 */
export const 成片档表 = {
  '4k60': { 渲染倍数: 3, 宽: 3840, 高: 2160, fps: 60, 码率上限: '40M', 缓冲: '80M' },
  '1080p60': { 渲染倍数: 1.5, 宽: 1920, 高: 1080, fps: 60, 码率上限: '15M', 缓冲: '30M' },
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

const 显卡 = () => 配置('gl') as 'angle' | 'swangle' | 'egl' | 'swiftshader' | 'vulkan' | 'angle-egl';

/** 段的画面：字幕是这一段的（段字幕.ts），进 inputProps 也就进指纹 */
export const 渲染参数 = (级别: 渲染级别, 字幕: readonly 段字幕[] = []) => {
  const 档 = 成片档();
  return {
    inputProps: 规范化设置({ 级别, 输出fps: 档.fps, 字幕 }),
    codec: 'h264' as const,
    crf: 18,
    x264Preset: 'medium' as const,
    encodingMaxRate: 档.码率上限,
    encodingBufferSize: 档.缓冲,
    colorSpace: 'bt709' as const,
    pixelFormat: 'yuv420p' as const,
    muted: true,
    imageFormat: 级别 === '预览' ? ('jpeg' as const) : ('png' as const),
    jpegQuality: 95,
    scale: 级别 === '预览' ? 1 : 档.渲染倍数,
    gl: 显卡(),
    concurrency: 1,
  };
};

export type 渲染参数表 = ReturnType<typeof 渲染参数>;

/** 段的声音：按编排帧率（段.ts 的 fps）出、不包编排时钟，和以前母版里的声音一样；不出画面，和级别、成片档无关 */
export const 声音渲染参数 = () => ({
  inputProps: 规范化设置({ 级别: '视频' }),
  codec: 'wav' as const,
  audioCodec: 'pcm-16' as const,
  gl: 显卡(),
  concurrency: 1,
});

