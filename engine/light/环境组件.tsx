// <环境>：照环境描述（环境.ts）摆灯、天、云、雾。直接放在 ThreeCanvas 下面（场景坐标的东西自己转到 Z 朝上），描述可以是随帧变的环境轨。
// 怎么画由段自己引的画法模块定（engine/light/画法/<名>.tsx，默认导出 定义画法(名, 组件)），和描述的 画法 对上：
//   import 主世界 from '@engine/light/画法/主世界.tsx';  <环境 描述={…} 画法={主世界} 镜头={…} />
// 画法不放在一张总表里：加一种画法（下界、末地、模组维度）只加一个模块，已有段的依赖不变、不过期。
// 云要画布挂 <ScreenAo />；投影要画布开 shadows，投影的东西自己开 castShadow（体素世界给同一个 shadowLightDir）。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { 灯光系数, 环境在, type 环境描述, type 环境轨 } from './环境.ts';
import type { 画法模块 } from './环境部件.tsx';

export type 环境属性 = {
  描述: 环境描述 | 环境轨;
  /** 画法模块；描述在段里换画法（比如从主世界进暮色）就给几个，按描述的 画法 挑 */
  画法: 画法模块 | readonly 画法模块[];
  /** 镜头位置（场景坐标）：穹顶跟着它，平行主光照着它 */
  镜头: readonly number[];
  /** 镜头离地多高（米）：投影的中、远两级切在 max(300, 2 × 离地)。不给 = 镜头 z */
  离地?: number;
  /** 给了穹顶就固定在这里（暮色画法不放大，同 TwilightLighting 的 domeCenter）；不给跟着镜头 */
  穹顶中心?: readonly number[];
  /** 关键帧按第几帧取（场窗口段要按场内帧取就传进来）；不给 = 段内当前帧 */
  帧?: number;
};

export const 环境: React.FC<环境属性> = ({ 描述, 画法, 镜头, 离地, 穹顶中心, 帧 }) => {
  const 当前帧 = useCurrentFrame();
  const e = 环境在(描述, 帧 ?? 当前帧);
  const 灯 = 灯光系数(e);
  const 们: readonly 画法模块[] = Array.isArray(画法) ? 画法 : [画法 as 画法模块];
  const 画 = 们.find((m) => m.名 === e.画法);
  if (!画) throw new Error(`描述的画法是「${e.画法}」，<环境 画法> 给的是 ${们.map((m) => `「${m.名}」`).join('、')}：引 engine/light/画法/${e.画法}.tsx 传进来`);
  return <画.组件 e={e} 灯={灯} 镜头={镜头} 离地={离地 ?? 镜头[2]!} 穹顶中心={穹顶中心} />;
};
