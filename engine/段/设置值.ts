// 渲染设置的取值和校验（纯数据，pipeline 也 import）。Remotion 里由 设置.ts 读 inputProps 再经 context 往下传；整份设置进指纹。
export const 渲染级别取值 = ['视频', '预览'] as const;
export type 渲染级别 = (typeof 渲染级别取值)[number];

/** 一屏字幕：pipeline 按成片宽高画好的整帧透明底 PNG（pipeline/合成/字幕卡.ts，data URL），帧是本段的输出帧 [起, 止)。
 *  画成整帧大小再铺满画面：截图放大后正好一个 PNG 像素对一个成片像素，不用在页面上摆小数像素 */
export type 段字幕 = { 图: string; 起: number; 止: number };

/**
 * 输出fps：Composition 的帧率（成片档的帧率）；null 是 段格（60，engine/段/段定义.ts），Studio 里就这样看。
 * 字幕：只有出成片的那一遍带（每段渲出来就是成片的一截，用户 11-05 定「母版 = 成片切片」）。
 */
export type 渲染设置 = { 级别: 渲染级别; 输出fps: number | null; 字幕: readonly 段字幕[] };

export const 默认设置: 渲染设置 = { 级别: '视频', 输出fps: null, 字幕: [] };

/** inputProps → 渲染设置；有不认识的键或取值就报错（拼错一个键会悄悄用默认值，画面就和想的不一样） */
export const 规范化设置 = (raw: unknown): 渲染设置 => {
  const o = (raw ?? {}) as Record<string, unknown>;
  const 不认识 = Object.keys(o).filter((k) => !(k in 默认设置));
  if (不认识.length) throw new Error(`渲染设置里有不认识的键：${不认识.join('、')}（能用的：${Object.keys(默认设置).join('、')}）`);
  const 级别 = o.级别 ?? 默认设置.级别;
  if (!渲染级别取值.includes(级别 as 渲染级别)) throw new Error(`渲染设置的 级别 只能是 ${渲染级别取值.join('、')}，给的是 ${String(级别)}`);
  const 输出fps = o.输出fps ?? null;
  if (输出fps !== null && !(typeof 输出fps === 'number' && Number.isInteger(输出fps) && 输出fps > 0)) throw new Error(`渲染设置的 输出fps 要是正整数或 null，给的是 ${String(输出fps)}`);
  const 字幕 = (o.字幕 ?? []) as 段字幕[];
  if (!Array.isArray(字幕)) throw new Error('渲染设置的 字幕 要是数组');
  return { 级别: 级别 as 渲染级别, 输出fps, 字幕 };
};
