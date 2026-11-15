// 旋风。出处 goety 2.5.60.6：WhirlwindSpell（EverChargeSpell）、ServerParticleUtil.windParticle、WindParticle。
// 半径 2（风系法术，下界魔杖不加成）。持续施法每刻在施法者身上发 3 条白色风带，绕着施法者转：
// 宽 1、高 −0.5；宽 1、高 1.0；宽 2、高 0.5。每条寿命 20～39 刻，见 零件/丁风.tsx。
// 这里把 起点 当成施法者（脚底 = 起点 − 0.5 格）。持续刻数是自己定的（见 旋风.元.ts）。
// 没做：施法者被托起（竖直每刻 +0.04）和周围生物被吹开。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { WindParticles, type WindBirth } from '../零件/丁风.tsx';
import meta, { whirlwindDurTicks } from './旋风.元.ts';

const Whirlwind: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 种子: seed }) => {
  const tick = sec * 20;
  const feet: Vec3 = [from[0], from[1], from[2] - 0.5];
  const spawns: WindBirth[] = [];
  for (let t = 0; t < whirlwindDurTicks; t++) {
    if (t > tick) break;
    for (const [i, [width, height]] of ([[1, -0.5], [1, 1.0], [2, 0.5]] as const).entries()) {
      spawns.push({ 刻: t, originAt: () => feet, 宽: width, 高: height, 种子: seed * 1009 + t * 3 + i });
    }
  }
  return <WindParticles spawns={spawns} 刻={tick} 色={[1, 1, 1]} />;
};

export default defineSpellPerformance(meta, Whirlwind);
