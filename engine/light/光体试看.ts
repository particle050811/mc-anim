// 试看「光体」：给还没开光体的地点临时接上，或改已开地点的强、软封顶，看开了是什么样（用户 11-17「其他的要不先看一下对比图片 我再决定开不开」「给我开一个连续的对比，我看一下什么档位合适」）。
// 没开试看返回 undefined，接的地方照原样：着色器、程序键、画面都不变。没给的参数照 base（各地点自己那套；不给就是下界正片那套：强 1.5、软封顶 1.5、最小光 0.004）。
// 不封顶：软封顶写个很大的数（如 1e6），x / (1 + x / 1e6) ≈ x。
import { trialParams } from '../core/试看.ts';
import type { LightVolumeParams } from './光体.ts';

const netherSet: LightVolumeParams = { strength: 1.5, knee: 1.5, minLight: 0.004 };

export const trialLightVolume = (base: LightVolumeParams = netherSet): LightVolumeParams | undefined => {
  const t = trialParams<Partial<Record<'强' | '软封顶', number>>>('光体');
  if (t === undefined) return undefined;
  return { strength: t['强'] ?? base.strength, knee: t['软封顶'] ?? base.knee, minLight: base.minLight };
};
