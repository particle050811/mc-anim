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
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { addVec, scaleVec, sub, unitVec } from '../零件/弹道.ts';
import { SquareTubeFaces, squareTubeFace } from '../零件/方管.tsx';
import meta, { corruptBeam } from './腐化.元.ts';
import beamGlowPng from 'asset:贴图/法术/goety/entity/corrupted/beacon_beam_glow';
import beamMainPng from 'asset:贴图/法术/goety/entity/corrupted/beacon_beam_main';
import beamCorePng from 'asset:贴图/法术/goety/entity/corrupted/beacon_beam_core';

const [glowPng, bodyPng, coreImg] = [beamGlowPng, beamMainPng, beamCorePng].map(png) as [ReturnType<typeof png>, ReturnType<typeof png>, ReturnType<typeof png>];
const beamWidth = 0.2;
const downOffset = -0.115;

const Corrupt: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target }) => {
  const t = Math.floor(sec * 20);
  const { start: startPos, end, length: length } = corruptBeam(from, target);
  const pulse = 0.9 + 0.1 * Math.sin(t * 0.99) * Math.sin(t * 0.3) * Math.sin(t * 0.1);
  const scrollOffset = t * -0.02;
  const tip = addVec(startPos, scaleVec(unitVec(sub(end, startPos)), length / 10));
  return (
    <>
      <SquareTubeFaces quads={squareTubeFace(startPos, tip, beamWidth * 1.75 * pulse, { alongAxis: 'v', lengthStart: 0.5, lengthEnd: 1, offset: downOffset, taper: true })} image={glowPng} blend="半透明" opacity={0.9} noDepthTest 序={1} />
      <SquareTubeFaces quads={squareTubeFace(startPos, end, beamWidth, { alongAxis: 'v', lengthStart: scrollOffset, lengthEnd: scrollOffset + length * 1.5, offset: downOffset })} image={bodyPng} blend="半透明" opacity={0.7} repeat noDepthTest 序={2} />
      <SquareTubeFaces quads={squareTubeFace(startPos, end, beamWidth * 0.7, { alongAxis: 'v', lengthStart: scrollOffset, lengthEnd: scrollOffset + length * 1.5, offset: downOffset })} image={coreImg} blend="半透明" repeat noDepthTest 序={3} />
    </>
  );
};

export default defineSpellPerformance(meta, Corrupt);
