// 试看光影用的替身：anim still、bench 加 --光影 时，打包把段里引的 engine/三渲二/画布.tsx 换成这个文件（pipeline/渲/光影试看.ts；这里引的原画布不换），
// 光影的样式改从页面环境变量取（JSON，见 预设.ts 的 光影选项），「关」= 强制不开；场景给的 光影场 照用。只在试看的包里，正式段不引它。
import React from 'react';
import { ToonCanvas as BaseToonCanvas, type ToonCanvasParams } from '../画布.tsx';
import type { ShadingOptions } from './预设.ts';

// 原画布模块别的导出照原样转出去（被换掉的是整个模块，少一个引的地方就拿到 undefined）
export type { ToonCanvasParams };
export { shadingScope } from '../画布.tsx';

/** pipeline/渲/光影试看.ts 里同一个名字 */
const envName = 'REMOTION_ANIM_LIGHTING';

/** undefined = 没给（照段自己的），null = 关 */
const readOptions = (): ShadingOptions | null | undefined => {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[envName];
  if (!v) return undefined;
  const o = JSON.parse(v) as Partial<ShadingOptions> & { 名?: string };
  if (!o.preset || (o.preset as string) === '关') return null;
  return o as ShadingOptions;
};

export const trialToonCanvas: React.FC<ToonCanvasParams> = (p) => {
  const opts = readOptions();
  return <BaseToonCanvas {...p} shading={opts === undefined ? p.shading : opts} />;
};
