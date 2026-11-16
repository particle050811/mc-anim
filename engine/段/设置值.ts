// 渲染设置的取值和校验（纯数据，pipeline 也 import）。Remotion 里由 设置.ts 读 inputProps 再经 context 往下传；整份设置进指纹。
export const renderLevels = ['视频', '预览'] as const;
export type RenderLevel = (typeof renderLevels)[number];

/** 一屏字幕：pipeline 按成片宽高画好的整帧透明底 PNG（pipeline/合成/字幕卡.ts，data URL），帧是本段的输出帧 [起, 止)。
 *  画成整帧大小再铺满画面：截图放大后正好一个 PNG 像素对一个成片像素，不用在页面上摆小数像素 */
export type SegSubtitle = { image: string; start: number; end: number };

/**
 * 输出fps：Composition 的帧率（成片档的帧率）；null 是 段格（60，engine/段/段定义.ts），Studio 里就这样看。
 * 字幕：只有出成片的那一遍带（每段渲出来就是成片的一截，用户 11-05 定「母版 = 成片切片」）。
 */
export type RenderSettings = { level: RenderLevel; outputFps: number | null; subtitles: readonly SegSubtitle[] };

export const defaultSettings: RenderSettings = { level: '视频', outputFps: null, subtitles: [] };

/** inputProps → 渲染设置；有不认识的键或取值就报错（拼错一个键会悄悄用默认值，画面就和想的不一样） */
export const normalizeSettings = (raw: unknown): RenderSettings => {
  const o = (raw ?? {}) as Record<string, unknown>;
  const unknownKeys = Object.keys(o).filter((k) => !(k in defaultSettings));
  if (unknownKeys.length) throw new Error(`渲染设置里有不认识的键：${unknownKeys.join('、')}（能用的：${Object.keys(defaultSettings).join('、')}）`);
  const level = o.level ?? defaultSettings.level;
  if (!renderLevels.includes(level as RenderLevel)) throw new Error(`渲染设置的 级别 只能是 ${renderLevels.join('、')}，给的是 ${String(level)}`);
  const outputFps = o.outputFps ?? null;
  if (outputFps !== null && !(typeof outputFps === 'number' && Number.isInteger(outputFps) && outputFps > 0)) throw new Error(`渲染设置的 输出fps 要是正整数或 null，给的是 ${String(outputFps)}`);
  const subtitles = (o.subtitles ?? []) as SegSubtitle[];
  if (!Array.isArray(subtitles)) throw new Error('渲染设置的 字幕 要是数组');
  return { level: level as RenderLevel, outputFps: outputFps, subtitles: subtitles };
};
