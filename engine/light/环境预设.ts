// 现有暮色那套（暮色光照.tsx 的 TwilightLighting）写成环境描述：<环境 描述={暮色环境({ 雾远 })} 镜头 离地 穹顶中心 /> 和
// <TwilightLighting camPos fogFar fogNear aboveGround domeCenter /> 出一样的画面（作品/应力转动/核对/环境/ 逐像素比过）。
// 主世界那套带 应力转动 的太阳和加的云，预设在 作品/应力转动/地点/主世界环境.ts。
import { twilightSunDir } from './光照配比.ts';
import { twilightFogColor } from './天空.tsx';
import { shadowFarFor, twilightHeightFog } from './暮色光照.tsx';
import { 定义环境, type 环境描述 } from './环境.ts';
import { 暮色森林 } from './维度.ts';

/** 雾远、雾近：同 TwilightLighting 的 fogFar、fogNear（米；雾近不给 = 雾远 × 0.25） */
export const 暮色环境 = (o: { 雾远: number; 雾近?: number }): 环境描述 =>
  定义环境(
    {
      维度: 暮色森林,
      画法: '暮色',
      太阳: twilightSunDir,
      灯光: { 档位: '暮色' },
      雾: { 种类: '线性', 近: o.雾近 ?? o.雾远 * 0.25, 远: o.雾远, 色: twilightFogColor },
      高度雾: { 起点: twilightHeightFog.start, 半衰: twilightHeightFog.halfLife, 浓度: twilightHeightFog.density },
      云: { 种类: 'photon', 海平面: 0 },
      投影: { 远: shadowFarFor(o.雾远) },
    },
    '暮色环境',
  );
