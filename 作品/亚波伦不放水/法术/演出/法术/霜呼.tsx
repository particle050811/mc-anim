// 霜呼（配下界魔杖：下界魔杖不是霜呼的对口法杖，走小号霜粒子那一支）。出处 goety 2.5.60.6：FrostBreathSpell.showWandBreath、IBreathingSpell.dragonBreathAttack、FrostParticle（SmallProvider）、particles/small_frost.json。
// 持续施法，每刻撒 10 颗 SMALL_FROST：速率 = 射程 8 ÷ 10 × 0.55 = 0.44 格/刻 × (1～2)，撒法见 零件/吐息.tsx 的 龙息撒。
// 粒子：半边长 (0.1～0.2) × 3 × 0.5，寿命 20 刻，摩擦 0.96，重力 −0.1（慢慢上飘），每刻水平速度 ±随机 ÷ 500；
// 贴图 frost_1～6 再倒回 1 共 11 张，每 2 刻换一张；不透明粒子表，受环境光（这里按满亮度画）；碰地就没。
// 一颗最远飞 6～12 格（速率 × Σ0.96^k），所以射程就这么远；起点离目标比这远的话喷不到，游戏里也是。
// 没做：落地时原版 SNOWFLAKE 粒子、目标身上的冰冻效果。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { sub } from '../零件/弹道.ts';
import { initialRadius, BreathParticles, scatterDragonBreath, type BreathBirth, type BreathParticleClass } from '../零件/吐息.tsx';
import meta, { frostBreathDurTicks, frostBreathParticleLifeTicks } from './霜呼.元.ts';
import frost1Png from 'asset:贴图/法术/goety/particle/frost_1';
import frost2Png from 'asset:贴图/法术/goety/particle/frost_2';
import frost3Png from 'asset:贴图/法术/goety/particle/frost_3';
import frost4Png from 'asset:贴图/法术/goety/particle/frost_4';
import frost5Png from 'asset:贴图/法术/goety/particle/frost_5';
import frost6Png from 'asset:贴图/法术/goety/particle/frost_6';
import { mulberry32 } from '@engine/core/数学.ts';

const [frostFrame1, frostFrame2, frostFrame3, frostFrame4, frostFrame5, frostFrame6] = [frost1Png, frost2Png, frost3Png, frost4Png, frost5Png, frost6Png].map(png);
const FrostBreath: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => {
  const tick = sec * 20;
  const breathKind: BreathParticleClass = {
    frame: [frostFrame1!, frostFrame2!, frostFrame3!, frostFrame4!, frostFrame5!, frostFrame6!, frostFrame5!, frostFrame4!, frostFrame3!, frostFrame2!, frostFrame1!],
    帧号: (age) => Math.floor(age / 2) % 11,
    寿命: frostBreathParticleLifeTicks,
    重力: -0.1,
    摩擦: 0.96,
    jitterHoriz: 1 / 500,
    jitterVert: 0,
    ground: target[2],
  };
  const dir = sub([target[0], target[1], target[2] + 0.9], from);
  const spawns: BreathBirth[] = [];
  for (let n = Math.max(0, Math.floor(tick) - frostBreathParticleLifeTicks); n <= Math.min(Math.floor(tick), frostBreathDurTicks - 1); n++)
    for (const spawn of scatterDragonBreath(from, dir, 10, 0.44, n, seed)) spawns.push({ 刻: n, ...spawn, radius: initialRadius(mulberry32(spawn.seed + 9)()) * 3 * 0.5 });
  return <BreathParticles type={breathKind} spawns={spawns} sec={sec} />;
};

export default defineSpellPerformance(meta, FrostBreath);
