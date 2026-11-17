// 试看「光体」：给还没开光体的地点临时接上，看开了是什么样（用户 11-17「其他的要不先看一下对比图片 我再决定开不开」）。
// 没开试看返回 undefined，接的地方什么都不挂：着色器、程序键、画面都不变。没给的参数照下界正片那套（强 1.5、软封顶 1.5、最小光 0.004）。
import { trialParams } from '../core/试看.ts';
import type { LightVolumeParams } from './光体.ts';

export const trialLightVolume = (): LightVolumeParams | undefined => {
  const t = trialParams<Partial<Record<'强' | '软封顶', number>>>('光体');
  if (t === undefined) return undefined;
  return { strength: t['强'] ?? 1.5, knee: t['软封顶'] ?? 1.5, minLight: 0.004 };
};
