// 试看光影用的替身：anim still、bench 加 --光影 时，打包把段里引的 engine/三渲二/画布.tsx 换成这个文件（pipeline/渲/光影试看.ts；这里引的原画布不换），
// 光影的样式改从页面环境变量取（JSON，见 预设.ts 的 光影选项），「关」= 强制不开；场景给的 光影场 照用。只在试看的包里，正式段不引它。
import React from 'react';
import { 三渲二画布 as 原画布, type 三渲二画布参数 } from '../画布.tsx';
import type { 光影选项 } from './预设.ts';

export type { 三渲二画布参数 };

/** pipeline/渲/光影试看.ts 里同一个名字 */
const 环境名 = 'REMOTION_ANIM_LIGHTING';

/** undefined = 没给（照段自己的），null = 关 */
const 读选项 = (): 光影选项 | null | undefined => {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[环境名];
  if (!v) return undefined;
  const o = JSON.parse(v) as Partial<光影选项> & { 名?: string };
  if (!o.预设 || (o.预设 as string) === '关') return null;
  return o as 光影选项;
};

export const 三渲二画布: React.FC<三渲二画布参数> = (p) => {
  const 选 = 读选项();
  return <原画布 {...p} 光影={选 === undefined ? p.光影 : 选} />;
};
