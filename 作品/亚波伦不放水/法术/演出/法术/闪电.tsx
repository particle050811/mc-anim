// 闪电。出处 goety 2.5.60.6：LightningSpell、SpellLightningBolt、SpellLightningBoltRenderer（和原版 LightningBoltRenderer 一字不差）；原版 1.20.1 LightningBolt.tick。
// - 在目标脚下生成一道闪电实体，画法就是原版闪电，直接用库里的 LightningBolt。
// - 实体的命（LightningBolt.tick）：life 从 2 起每刻 −1；小于 0 之后，每刻有机会（life < −nextInt(10)）再闪一轮：flashes −1、life 回 1、换一个形状；flashes（1～3）用完就消失。
//   实体活着的时候闪电一直画着，每轮换一次形状。
// 和游戏的差别：库里的 LightningBolt 自带一盏照亮四周的灯，这里跟着闪电一直亮；游戏里只有 life ≥ 0 的那几刻天空发白。没做天空发白、点火。
import React from 'react';
import { LightningBolt } from '@库/特效/闪电.tsx';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import meta, { lightningMaxTicks } from './闪电.元.ts';
import { mulberry32 } from '@engine/core/数学.ts';

/** 照 tick 走一遍：每一轮从第几刻起、用哪个形状种子；末 = 实体消失的刻 */
const makeBolts = (seed: number): { bolts: { startTick: number; shapeSeed: number }[]; endTick: number } => {
  const r = mulberry32(seed * 31337 + 11);
  const randBelow = (n: number) => Math.floor(r() * n);
  let life = 2;
  let flashes = randBelow(3) + 1;
  const bolts = [{ startTick: 0, shapeSeed: seed * 13 + 1 }];
  for (let tick = 1; tick <= lightningMaxTicks; tick++) {
    life--;
    if (life < 0) {
      if (flashes === 0) return { bolts, endTick: tick };
      if (life < -randBelow(10)) {
        flashes--;
        life = 1;
        bolts.push({ startTick: tick, shapeSeed: seed * 13 + 1 + bolts.length });
      }
    }
  }
  return { bolts, endTick: lightningMaxTicks };
};

const Lightning: React.FC<SpellPerformanceProps> = ({ 秒: sec, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const { bolts: flashes, endTick } = makeBolts(seed);
  if (tick >= endTick) return null;
  const bolt = [...flashes].reverse().find((x) => x.startTick <= tick)!;
  return <LightningBolt seed={bolt.shapeSeed} flash={1} position={[target[0], target[1], target[2]]} />;
};

export default defineSpellPerformance(meta, Lightning);
