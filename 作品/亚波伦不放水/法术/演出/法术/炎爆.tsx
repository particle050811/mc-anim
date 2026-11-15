// 炎爆（配下界魔杖：半径 +0.5，大火 4～16 颗）。出处 goety 2.5.60.6：FireBlastSpell、ShockwaveParticleOption、SphereExplodeParticleOption、FireParticle（BIG_FIRE）。
// 半径 3 + 0.5 = 3.5，颜色 14523414 = 0xDD9C16（橙金），放出来当刻，施法者脚底 + 0.5 格：
// - 冲击波环（大小 3.5、速度 1、淡出）和加色球（大小 3.5、速度 1）；
// - BIG_FIRE 4～16 颗，位置 = 中心 + 每个分量 (rand − 0.5) × 3.5，不动（速度 0，只有构造里 ×0.01 的随机），寿命 8 刻，半边长 0.3～0.6，贴图按年龄。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格）。
// 没做：半径内生物受击着火；BIG_FIRE 随机左右翻转。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { hexColor } from '../零件/材质.ts';
import { ShockwaveRing } from '../零件/冲击波.tsx';
import { defaultRadius, risingInitial, bigFireClass, bigFireLifetime } from '../零件/丁粒子.ts';
import { SphereBurst } from '../零件/甲/爆.tsx';
import { TexturedParticles, type ParticleBirth } from '../零件/粒子.tsx';
import meta from './炎爆.元.ts';
import { mulberry32 } from '@engine/core/数学.ts';

const orangeGold = hexColor(0xdd9c16);
const radius = 3.5;

const FlameBurst: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 种子: seed }) => {
  const tick = sec * 20;
  const r = mulberry32(seed * 7919 + 17);
  const particleCount = 4 + Math.floor(r() * 13);
  const flames: ParticleBirth[] = Array.from({ length: particleCount }, (_, i) => {
    const pos: [number, number, number] = [from[0] + (r() - 0.5) * radius, from[1] + (r() - 0.5) * radius, from[2] + (r() - 0.5) * radius];
    const initial = risingInitial(seed * 101 + i, pos, [0, 0, 0], false);
    return { 刻: 0, 位: initial.位, 速: initial.速, 寿命: bigFireLifetime, radius: defaultRadius(r) * 3, 种子: initial.种子 };
  });
  return (
    <>
      <ShockwaveRing 位={from} 刻={tick} 大小={radius} 色={orangeGold} 速={1} />
      <SphereBurst 位={from} 刻={tick} 色={orangeGold} 尺寸={radius} 速={1} />
      <TexturedParticles 类={bigFireClass} spawns={flames} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, FlameBurst);
