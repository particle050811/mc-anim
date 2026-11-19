// 试看「光体」：给还没开光体的地点临时接上，或改已开地点的强、软封顶，看开了是什么样（用户 11-17「其他的要不先看一下对比图片 我再决定开不开」「给我开一个连续的对比，我看一下什么档位合适」）。
// 方案、曲线、米每级、p：几种主流的方块光做法（用户 11-19「搞几个主流方案…渲染几帧给我看看」，做法见 光体.ts 的 LightScheme）。
// 没开试看返回 undefined，接的地方照原样：着色器、程序键、画面都不变。没给的参数照 base（各地点自己那套；不给就是下界正片那套：强 1.5、软封顶 1.5、最小光 0.004）。
// 不封顶：软封顶写个很大的数（如 1e6），x / (1 + x / 1e6) ≈ x。换了方案时不给强就是 1（满级的亮度 = 方块原色 × 1）。
import { trialParams } from '../core/试看.ts';
import { schemeCurves, schemeKinds, type LightVolumeParams } from './光体.ts';

const netherSet: LightVolumeParams = { strength: 1.5, knee: 1.5, minLight: 0.004 };

type Trial = Partial<{ 强: number; 软封顶: number; 方案: (typeof schemeKinds)[number]; 曲线: (typeof schemeCurves)[number]; 米每级: number; p: number }>;

export const trialLightVolume = (base: LightVolumeParams = netherSet): LightVolumeParams | undefined => {
  const t = trialParams<Trial>('光体');
  if (t === undefined) return undefined;
  const kind = t['方案'] ?? '现状';
  if (!schemeKinds.includes(kind)) throw new Error(`试看 光体：方案只有 ${schemeKinds.join('、')}`);
  if (kind === '现状') return { strength: t['强'] ?? base.strength, knee: t['软封顶'] ?? base.knee, minLight: base.minLight };
  const curve = t['曲线'] ?? '原版';
  if (!schemeCurves.includes(curve)) throw new Error(`试看 光体：曲线只有 ${schemeCurves.join('、')}`);
  return { strength: t['强'] ?? 1, knee: base.knee, minLight: base.minLight, scheme: { kind, curve, metersPerLevel: t['米每级'] ?? 1, p: t['p'] ?? 4 } };
};
