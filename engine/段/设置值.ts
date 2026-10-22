// 渲染设置的取值和校验（纯数据，pipeline 也 import）。Remotion 里由 设置.ts 读 inputProps 再经 context 往下传；整份设置进指纹。
export const 渲染级别取值 = ['视频', '预览'] as const;
export type 渲染级别 = (typeof 渲染级别取值)[number];

export type 渲染设置 = { 级别: 渲染级别 };

export const 默认设置: 渲染设置 = { 级别: '视频' };

/** inputProps → 渲染设置；有不认识的键或取值就报错（拼错一个键会悄悄用默认值，画面就和想的不一样） */
export const 规范化设置 = (raw: unknown): 渲染设置 => {
  const o = (raw ?? {}) as Record<string, unknown>;
  const 不认识 = Object.keys(o).filter((k) => !(k in 默认设置));
  if (不认识.length) throw new Error(`渲染设置里有不认识的键：${不认识.join('、')}（能用的：${Object.keys(默认设置).join('、')}）`);
  const 级别 = o.级别 ?? 默认设置.级别;
  if (!渲染级别取值.includes(级别 as 渲染级别)) throw new Error(`渲染设置的 级别 只能是 ${渲染级别取值.join('、')}，给的是 ${String(级别)}`);
  return { 级别: 级别 as 渲染级别 };
};
