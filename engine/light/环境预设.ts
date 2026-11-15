// 现有暮色那套（暮色光照.tsx 的 TwilightLighting）写成环境描述：<环境 描述={暮色环境({ 雾远 })} 镜头 离地 穹顶中心 /> 和
// <TwilightLighting camPos fogFar fogNear aboveGround domeCenter /> 出一样的画面（作品/应力转动/核对/环境/ 逐像素比过）。
// 主世界那套带 应力转动 的太阳和加的云，预设在 作品/应力转动/地点/主世界环境.ts。
import { twilightSunDir } from './光照配比.ts';
import { twilightFogColor } from './天空.tsx';
import { shadowFarFor, twilightHeightFog } from './暮色光照.tsx';
import { defineEnvironment, type EnvDescription } from './环境.ts';
import { twilightForest } from './维度.ts';

/** 雾远、雾近：同 TwilightLighting 的 fogFar、fogNear（米；雾近不给 = 雾远 × 0.25） */
export const twilightEnv = (o: { fogFar: number; fogNear?: number }): EnvDescription =>
  defineEnvironment(
    {
      维度: twilightForest,
      画法: '暮色',
      sun: twilightSunDir,
      lightSpec: { tier: '暮色' },
      fog: { 种类: '线性', near: o.fogNear ?? o.fogFar * 0.25, far: o.fogFar, 色: twilightFogColor },
      heightFog: { start: twilightHeightFog.start, halfLife: twilightHeightFog.halfLife, density: twilightHeightFog.density },
      cloud: { 种类: 'photon', 海平面: 0 },
      shadow: { far: shadowFarFor(o.fogFar) },
    },
    '暮色环境',
  );
