// 灯光档位：环境描述（环境.ts）的 灯光.档位 → 直射、天光、环境光、自发光。
// 柔档～黄昏六档的数抄自 光照配比.ts 的 presets（那张表没导出，又不能改它：一改用到它的段全部过期），灯光档位.test.ts 逐个和源文件核对；
// 暮色、主世界直接引那边导出的 twilightMix、overworldMix（暮色 = 黄昏档 × 光倍 2，用户 10-08 定）。
// 注意：暮色画法要和暮色那套同样曝光，用别的档时写 倍: 2（同 光照配比.ts 的 lightGain）。
import { overworldMix, twilightMix, type LightMix } from './光照配比.ts';
import type { 档位名, 环境描述 } from './环境.ts';

export const 灯光档位表: Readonly<Record<档位名, LightMix>> = {
  柔档: { 直射: 4.3, 天光: 1.65, 环境光: 0.32, 自发光: 0.2 },
  柔档提亮: { 直射: 4.73, 天光: 1.815, 环境光: 0.352, 自发光: 0.22 },
  中档: { 直射: 5.9, 天光: 1.42, 环境光: 0.235, 自发光: 0.135 },
  强档: { 直射: 7.0, 天光: 0.9, 环境光: 0.12, 自发光: 0.07 },
  硬档: { 直射: 7.6, 天光: 0.55, 环境光: 0.07, 自发光: 0.04 },
  黄昏: { 直射: 8, 天光: 1.5, 环境光: 0.14, 自发光: 0.06 },
  暮色: twilightMix,
  主世界: overworldMix,
};

/** 描述的灯光档位 × 倍（倍不写时原样返回表里那份，数一个不动） */
export const 档位配比 = (灯光: 环境描述['灯光']): LightMix => {
  const mix = 灯光档位表[灯光.档位];
  if (!mix) throw new Error(`没有灯光档位「${灯光.档位}」（有：${Object.keys(灯光档位表).join('、')}）`);
  const k = 灯光.倍;
  if (k === undefined || k === 1) return mix;
  return { 直射: mix.直射 * k, 天光: mix.天光 * k, 环境光: mix.环境光 * k, 自发光: mix.自发光 * k };
};
