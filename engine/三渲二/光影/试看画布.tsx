// 试看光影用的替身：anim still、bench 加 --光影 时，打包把 engine/三渲二/画布.tsx 整个换成这个文件（pipeline/渲/光影试看.ts），
// 现有段一行不改就能看开了光影的样子。光影选项从页面环境变量取（JSON：{ 预设, 时段?, 太阳?, 水?, 水天顶? }，见 预设.ts 的 光影选项），「关」或没给 = 不开光影。
// 只在试看的包里，正式段不引它。
import React from 'react';
import type { 三渲二画布参数 } from '../画布.tsx';
import { 光影三渲二画布 } from './画布.tsx';
import type { 光影选项 } from './预设.ts';

export type { 三渲二画布参数 };

/** pipeline/渲/光影试看.ts 里同一个名字 */
const 环境名 = 'REMOTION_ANIM_LIGHTING';

const 读选项 = (): 光影选项 | null => {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[环境名];
  if (!v) return null;
  const o = JSON.parse(v) as Partial<光影选项> & { 名?: string };
  if (!o.预设 || (o.预设 as string) === '关') return null;
  return o as 光影选项;
};

export const 三渲二画布: React.FC<三渲二画布参数> = (p) => <光影三渲二画布 {...p} 光影={读选项()} />;
