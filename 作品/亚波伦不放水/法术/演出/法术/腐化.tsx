// 腐化。出处 goety 2.5.60.6：CorruptedBeamSpell、CorruptedBeam、AbstractBeam、CorruptedBeamRenderer、ModRenderType.magicBeam。
// 持续施法，一根光束实体跟着施法者的视线。渲染器三层，都是 magicBeam（半透明、不做深度测试、不剔除背面、满亮度；贴图 alpha < 0.1 的丢掉）：
// - 辉光 beacon_beam_glow：起点处一个方口（半边 0.2 × 1.75 × 闪烁）往前收成一点的四棱锥，长 = 束长 ÷ 10，贴图 v 0.5～1，透明度 0.9；
//   闪烁 = 0.9 + 0.1 × sin(t × 0.99) × sin(t × 0.3) × sin(t × 0.1)，t 是世界时间（整刻）；
// - 主体 beacon_beam_main：半边 0.2 的方管，全长，贴图 v 从 滚 到 滚 + 束长 × 1.5，滚 = 世界时间 × (−0.02)（整刻跳，不插值），透明度 0.7；
// - 芯 beacon_beam_core：半边 0.2 × 0.7，同样的 v，透明度 1。
// 三层的截面都沿局部「上」往下偏 0.115 格（drawBeam 里的 yMin、yMax）。世界时间这里从出手那刻算 0。
// 没做：光束扫到的生物身上的腐化效果粒子；光束实体跟随施法者转头（这里起点、方向固定）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 加, 乘, 减, 单位 } from '../零件/弹道.ts';
import { 四边面们, 方管面 } from '../零件/方管.tsx';
import 元, { 腐化束 } from './腐化.元.ts';
import 辉光图数据 from 'asset:贴图/法术/goety/entity/corrupted/beacon_beam_glow';
import 主体图数据 from 'asset:贴图/法术/goety/entity/corrupted/beacon_beam_main';
import 芯图数据 from 'asset:贴图/法术/goety/entity/corrupted/beacon_beam_core';

const [辉光图, 主体图, 芯图] = [辉光图数据, 主体图数据, 芯图数据].map(png) as [ReturnType<typeof png>, ReturnType<typeof png>, ReturnType<typeof png>];
const 束宽 = 0.2;
const 下偏 = -0.115;

const 腐化: React.FC<法术演出属性> = ({ 秒, 起点, 目标 }) => {
  const t = Math.floor(秒 * 20);
  const { 起, 终, 长 } = 腐化束(起点, 目标);
  const 闪 = 0.9 + 0.1 * Math.sin(t * 0.99) * Math.sin(t * 0.3) * Math.sin(t * 0.1);
  const 滚 = t * -0.02;
  const 尖 = 加(起, 乘(单位(减(终, 起)), 长 / 10));
  return (
    <>
      <四边面们 面们={方管面(起, 尖, 束宽 * 1.75 * 闪, { 沿: 'v', 长起: 0.5, 长终: 1, 偏: 下偏, 收尖: true })} 图={辉光图} 混合="半透明" 透明度={0.9} 无深度测试 序={1} />
      <四边面们 面们={方管面(起, 终, 束宽, { 沿: 'v', 长起: 滚, 长终: 滚 + 长 * 1.5, 偏: 下偏 })} 图={主体图} 混合="半透明" 透明度={0.7} 重复 无深度测试 序={2} />
      <四边面们 面们={方管面(起, 终, 束宽 * 0.7, { 沿: 'v', 长起: 滚, 长终: 滚 + 长 * 1.5, 偏: 下偏 })} 图={芯图} 混合="半透明" 重复 无深度测试 序={3} />
    </>
  );
};

export default 定义法术演出(元, 腐化);
