// <环境>：照环境描述（环境.ts）摆灯、天、云、雾。直接放在 ThreeCanvas 下面（场景坐标的东西自己转到 Z 朝上），描述可以是随帧变的环境轨。
// 怎么画由段自己引的画法模块定（engine/light/画法/<名>.tsx，默认导出 defineDraw(名, 组件)），和描述的 画法 对上：
//   import 主世界 from '@engine/light/画法/主世界.tsx';  <环境 描述={…} 画法={主世界} 镜头={…} />
// 画法不放在一张总表里：加一种画法（下界、末地、模组维度）只加一个模块，已有段的依赖不变、不过期。
// 云要画布挂 <ScreenAo />；投影要画布开 shadows，投影的东西自己开 castShadow（体素世界给同一个 shadowLightDir）。
import React from 'react';
import { isEnvTrack, LightCoeffs, envAtFrame, type EnvDescription, type EnvTrack } from './环境.ts';
import type { DrawModule } from './环境部件.tsx';

export type EnvProps = {
  description: EnvDescription | EnvTrack;
  /** 画法模块；描述在段里换画法（比如从主世界进暮色）就给几个，按描述的 画法 挑 */
  画法: DrawModule | readonly DrawModule[];
  /** 镜头位置（场景坐标）：穹顶跟着它，平行主光照着它 */
  cameraPos: readonly number[];
  /** 镜头离地多高（米）：投影的中、远两级切在 max(300, 2 × 离地)。不给 = 镜头 z */
  eyeHeight?: number;
  /** 给了穹顶就固定在这里（暮色画法不放大，同 TwilightLighting 的 domeCenter）；不给跟着镜头 */
  domeCenter?: readonly number[];
  /** 描述是环境轨时，关键帧按第几帧取（帧是环境轨自己的格，调用处按秒换算好传进来）；描述是固定的不用给 */
  帧?: number;
};

export const Environment: React.FC<EnvProps> = ({ description, 画法: renderer, cameraPos, eyeHeight, domeCenter, 帧: frame }) => {
  if (isEnvTrack(description) && frame === undefined) throw new Error('<环境> 的描述是环境轨，要给 帧');
  const e = envAtFrame(description, frame ?? 0);
  const lighting = LightCoeffs(e);
  const modules: readonly DrawModule[] = Array.isArray(renderer) ? renderer : [renderer as DrawModule];
  const renderMode = modules.find((m) => m.名 === e.画法);
  if (!renderMode) throw new Error(`描述的画法是「${e.画法}」，<环境 画法> 给的是 ${modules.map((m) => `「${m.名}」`).join('、')}：引 engine/light/画法/${e.画法}.tsx 传进来`);
  return <renderMode.component e={e} lighting={lighting} cameraPos={cameraPos} eyeHeight={eyeHeight ?? cameraPos[2]!} domeCenter={domeCenter} />;
};
