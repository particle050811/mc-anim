// 虫群。出处 goety 2.5.60.6：SwarmSpell.showWandBreath、IBreathingSpell.breathAttack、FireParticle（FlyProvider）、particles/fly.json。
// 持续施法，每刻撒 2 只苍蝇粒子（FLY）：速率 0.3 格/刻 × (1～2)，散布 5，出生位置在口附近 高斯 ÷ 2 散开，撒法见 零件/吐息.tsx 的 吐息撒。
// 粒子：半边长 (0.1～0.2) × 3，寿命 8 刻，摩擦 0.96，重力 −0.1（从第 2 刻起），每刻水平速度 ±随机 ÷ 100、竖直 +随机 ÷ 100；
// 贴图 fly1、fly2、fly3、fly2 按年龄换（年龄 × 3 ÷ 8）；不透明粒子表；亮度随年龄升到满（这里按满亮度画）。
// 一只最远飞 2～4 格，射程就这么远。
// 没做：目标被咬死后生成的 InsectSwarm 实体（片里史蒂夫不是这么死的）；咬中的 INSECT_SWARM_BITE 声。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { sub } from '../零件/弹道.ts';
import { initialRadius, BreathParticles, scatterBreath, type BreathBirth, type BreathParticleClass } from '../零件/吐息.tsx';
import meta, { swarmDurTicks, swarmParticleLifeTicks } from './虫群.元.ts';
import fly1Png from 'asset:贴图/法术/goety/particle/fly1';
import fly2Png from 'asset:贴图/法术/goety/particle/fly2';
import fly3Png from 'asset:贴图/法术/goety/particle/fly3';

const [flyFrame1, secondFrame, flyFrame3] = [fly1Png, fly2Png, fly3Png].map(png);
const breathKind: BreathParticleClass = {
  帧: [flyFrame1!, secondFrame!, flyFrame3!, secondFrame!],
  帧号: (age) => Math.floor((age * 3) / swarmParticleLifeTicks),
  寿命: swarmParticleLifeTicks,
  重力: -0.1,
  firstTickNoGravity: true,
  摩擦: 0.96,
  jitterHoriz: 1 / 100,
  jitterVert: 1 / 100,
};

const swarm: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const dir = sub([target[0], target[1], target[2] + 0.9], from);
  const spawns: BreathBirth[] = [];
  for (let n = Math.max(0, Math.floor(tick) - swarmParticleLifeTicks); n <= Math.min(Math.floor(tick), swarmDurTicks - 1); n++)
    for (const spawn of scatterBreath(from, dir, 2, 0.3, 5, n, seed)) spawns.push({ 刻: n, ...spawn, radius: initialRadius(rng(spawn.种子 + 9)()) * 3 });
  return <BreathParticles 类={breathKind} spawns={spawns} 秒={sec} />;
};

export default defineSpellPerformance(meta, swarm);
