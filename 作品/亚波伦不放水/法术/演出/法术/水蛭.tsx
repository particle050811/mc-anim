// 水蛭。出处 goety 2.5.60.6：LeechingSpell、GatherTrailParticle、AbsorbTrailParticle。
// 持续施法，每刻（都是从目标吸向施法者）：
// - 1 条聚流（暗红 0xAA0000 = ChatFormatting.DARK_RED）：从目标半身高窜到施法者眼睛高度、水平随机偏 ±0.6 格的一点；
// - 8 颗吸收粒子（AbsorbTrailParticle）：出生在目标碰撞箱附近随机处（水平 ±0.6 格、高度 0～1.8），10 刻里匀速飞到同一个施法者点；
//   半边长 0.26 格的不透明方片（贴图原版 generic_0），颜色从 0xAA0000（每个分量 × 0.875～1.125）渐变到 0x00000A，满亮度。
// 这里施法者那头用起点。没做：施法者回血没有画面；配对的吸血声只按无敌帧估了时刻。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { mix } from '../零件/弹道.ts';
import { facePatch, QuadGroup, type QuadItem } from '../零件/面片.tsx';
import { hexColor, type RgbColor } from '../零件/材质.ts';
import { GatherStream, gatherLifetime } from '../零件/游带.tsx';
import meta, { leechDurTicks } from './水蛭.元.ts';
import diamondPng from 'asset:贴图/特效/粒子/generic_0';
import { mulberry32 } from '@engine/core/数学.ts';

const diamondImg = png(diamondPng);
const darkRed = hexColor(0xaa0000);
const endColor = hexColor(0x00000a);
const absorbLifeTicks = 10;

const leech: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const streams: React.ReactNode[] = [];
  const pieces: QuadItem[] = [];
  for (let n = Math.max(0, Math.floor(tick) - absorbLifeTicks); n <= Math.min(Math.floor(tick), leechDurTicks - 1); n++) {
    const r = mulberry32(seed * 7919 + n);
    const age = tick - n;
    const scatterPoint: Vec3 = [from[0] + (r() * 2 - 1) * 0.6, from[1] + (r() * 2 - 1) * 0.6, from[2]];
    streams.push(<GatherStream key={n} 从={[target[0], target[1], target[2] + 0.9]} 到={scatterPoint} age={age} 寿命={gatherLifetime(r())} 色={darkRed} />);
    for (let i = 0; i < 8; i++) {
      const spawnPoint: Vec3 = [target[0] + (r() * 2 - 1) * 0.6, target[1] + (r() * 2 - 1) * 0.6, target[2] + r() * 1.8];
      const channelOffset = [0.875 + r() * 0.25, 0.875 + r() * 0.25, 0.875 + r() * 0.25];
      if (age >= absorbLifeTicks) continue;
      // 第 k 刻末走完全程的 k ÷ 寿命；画的是上一刻到这一刻之间
      const progress = Math.max(0, age - 1) / absorbLifeTicks;
      const colorRatio = Math.min(1, age / absorbLifeTicks);
      const color: RgbColor = [0, 1, 2].map((c) => Math.min(1, darkRed[c]! * channelOffset[c]!) * (1 - colorRatio) + endColor[c]! * colorRatio) as unknown as RgbColor;
      pieces.push(facePatch(mix(spawnPoint, scatterPoint, progress), 0.26, color));
    }
  }
  return (
    <>
      {streams}
      <QuadGroup 图={diamondImg} 项={pieces} 混合="镂空" />
    </>
  );
};

export default defineSpellPerformance(meta, leech);
