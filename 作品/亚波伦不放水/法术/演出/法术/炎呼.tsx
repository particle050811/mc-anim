// 炎呼（配下界魔杖：对口法杖，喷大号龙焰）。出处 goety 2.5.60.6：FireBreathSpell.showWandBreath、IBreathingSpell.dragonBreathAttack、DragonFlameParticle（Provider，isBig）、particles/dragon_flame.json。
// 持续施法，每刻撒 10 颗 DRAGON_FLAME：速率 = 射程 8 ÷ 10 × 0.35 = 0.28 格/刻 × (1～2)，撒法见 零件/吐息.tsx 的 龙息撒。
// 粒子：半边长 (0.1～0.2) × 3，寿命 14 刻，摩擦 0.96，重力 −0.1，每刻水平速度 ±随机 ÷ 500；
// 贴图照 particles/dragon_flame.json 是 big_soul_fire_1～8（青蓝色的魂火，不是橙红），每 2 刻换一张；不透明粒子表、满亮度；碰地就没。
// 一颗最远飞 3～6 格，射程就这么远。
// 没做：每颗每刻 25% 掉一粒 DRAGON_FLAME_DROP 火星；落地的 BIG_SOUL_FIRE_GROUND 地火粒子；「周围随机点火」（在方块上放火）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { sub } from '../零件/弹道.ts';
import { initialRadius, BreathParticles, scatterDragonBreath, type BreathBirth, type BreathParticleClass } from '../零件/吐息.tsx';
import meta, { fireBreathDurTicks, fireBreathParticleLifeTicks } from './炎呼.元.ts';
import bigSoulFire1Png from 'asset:贴图/法术/goety/particle/big_soul_fire_1';
import bigSoulFire2Png from 'asset:贴图/法术/goety/particle/big_soul_fire_2';
import bigSoulFire3Png from 'asset:贴图/法术/goety/particle/big_soul_fire_3';
import bigSoulFire4Png from 'asset:贴图/法术/goety/particle/big_soul_fire_4';
import bigSoulFire5Png from 'asset:贴图/法术/goety/particle/big_soul_fire_5';
import bigSoulFire6Png from 'asset:贴图/法术/goety/particle/big_soul_fire_6';
import bigSoulFire7Png from 'asset:贴图/法术/goety/particle/big_soul_fire_7';
import bigSoulFire8Png from 'asset:贴图/法术/goety/particle/big_soul_fire_8';
import { mulberry32 } from '@engine/core/数学.ts';

const animFrames = [bigSoulFire1Png, bigSoulFire2Png, bigSoulFire3Png, bigSoulFire4Png, bigSoulFire5Png, bigSoulFire6Png, bigSoulFire7Png, bigSoulFire8Png].map(png);
const FlameBreath: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const breathKind: BreathParticleClass = { 帧: animFrames, 帧号: (age) => Math.floor(age / 2) % 8, 寿命: fireBreathParticleLifeTicks, 重力: -0.1, 摩擦: 0.96, jitterHoriz: 1 / 500, jitterVert: 0, ground: target[2] };
  const dir = sub([target[0], target[1], target[2] + 0.9], from);
  const spawns: BreathBirth[] = [];
  for (let n = Math.max(0, Math.floor(tick) - fireBreathParticleLifeTicks); n <= Math.min(Math.floor(tick), fireBreathDurTicks - 1); n++)
    for (const spawn of scatterDragonBreath(from, dir, 10, 0.28, n, seed)) spawns.push({ 刻: n, ...spawn, radius: initialRadius(mulberry32(spawn.种子 + 9)()) * 3 });
  return <BreathParticles 类={breathKind} spawns={spawns} 秒={sec} />;
};

export default defineSpellPerformance(meta, FlameBreath);
