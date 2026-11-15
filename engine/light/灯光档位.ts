// 灯光档位：环境描述（环境.ts）的 灯光.档位 → 直射、天光、环境光、自发光。
// 柔档～黄昏六档的数抄自 光照配比.ts 的 presets（那张表没导出，又不能改它：一改用到它的段全部过期），灯光档位.test.ts 逐个和源文件核对；
// 暮色、主世界直接引那边导出的 twilightMix、overworldMix（暮色 = 黄昏档 × 光倍 2，用户 10-08 定）。
// 注意：暮色画法要和暮色那套同样曝光，用别的档时写 倍: 2（同 光照配比.ts 的 lightGain）。
import { overworldMix, twilightMix, type LightMix } from './光照配比.ts';
import type { TierName, EnvDescription } from './环境.ts';

export const lightTierTable: Readonly<Record<TierName, LightMix>> = {
  柔档: { direct: 4.3, skylight: 1.65, ambient: 0.32, selfLight: 0.2 },
  柔档提亮: { direct: 4.73, skylight: 1.815, ambient: 0.352, selfLight: 0.22 },
  中档: { direct: 5.9, skylight: 1.42, ambient: 0.235, selfLight: 0.135 },
  强档: { direct: 7.0, skylight: 0.9, ambient: 0.12, selfLight: 0.07 },
  硬档: { direct: 7.6, skylight: 0.55, ambient: 0.07, selfLight: 0.04 },
  黄昏: { direct: 8, skylight: 1.5, ambient: 0.14, selfLight: 0.06 },
  暮色: twilightMix,
  主世界: overworldMix,
};

/** 描述的灯光档位（或自定的 配比）× 倍（倍不写时原样返回那份，数一个不动） */
export const tierMix = (lightSpec: EnvDescription['lightSpec']): LightMix => {
  const mix = 'lightMix' in lightSpec ? lightSpec.lightMix : lightTierTable[lightSpec.tier];
  if (!mix) throw new Error(`没有灯光档位「${'tier' in lightSpec ? lightSpec.tier : ''}」（有：${Object.keys(lightTierTable).join('、')}）`);
  const k = lightSpec.intensity;
  if (k === undefined || k === 1) return mix;
  return { direct: mix.direct * k, skylight: mix.skylight * k, ambient: mix.ambient * k, selfLight: mix.selfLight * k };
};
