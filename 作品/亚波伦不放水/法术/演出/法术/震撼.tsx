// 震撼。出处 goety 2.5.60.6：ShockingSpell、SLightningPacket、ClientProxy.shock、BoltRenderInfo.shock。
// - 持续施法：每刻从施法者眼睛到目标半身高发一道细电弧（shock 预设，粗 0.04），颜色 0xB1ABF1，寿命 5 刻；所以同一时刻叠着 5 道形状各异的。
// - 连锁电弧只在配风暴法杖时有，配下界魔杖没有。
// 没做：目标身上的受击火花。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { ElectricArc } from '../零件/电弧.tsx';
import { arcPresets } from '../零件/电弧形.ts';
import { hexColor } from '../零件/材质.ts';
import meta, { shakeLifeTicks, shakeDurTicks, shockLandPoint } from './震撼.元.ts';

const electricColor = hexColor(0xb1abf1);

const Shock: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => {
  const tick = sec * 20;
  const pulseTicks: number[] = [];
  for (let n = Math.max(0, Math.ceil(tick - shakeLifeTicks)); n <= Math.min(Math.floor(tick), shakeDurTicks - 1); n++) pulseTicks.push(n);
  return (
    <>
      {pulseTicks.map((n) => (
        <ElectricArc key={n} start={from} end={shockLandPoint(target)} settings={arcPresets.shock} 刻={tick - n} lifeTicks={shakeLifeTicks} 色={electricColor} seed={seed * 977 + n} />
      ))}
    </>
  );
};

export default defineSpellPerformance(meta, Shock);
