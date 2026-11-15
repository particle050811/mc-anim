// 尖牙盛宴。出处 goety 2.5.60.6：FeastSpell（ChargingSpell）、ServerParticleUtil.circularParticles、WandUtil.spawnFangs、Fangs。
// - 按住期间每刻（useSpell）：每个敌人脚边 4 次 circularParticles(BLOCK, 半径 1)，每次 ⌈π⌉ = 4 颗，出在脚底上 0.25 格、半径 1 格的圆里，方块取脚下那格。
// - 每 20 刻（SpellResult）：每个敌人脚下一颗尖牙（warmup 1，朝向 = 施法者指向敌人）；施法者眼睛处 10～44 颗 POOF。
// - 片里按住 3 轮（游戏里按多久咬多久）。配灾厄法杖才有的外圈 5 颗牙、半径 3 的碎屑不做。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { gameHorizAngleRad } from '../零件/地面.ts';
import { Fang, fangCritSpawns, CritStar } from '../零件/尖牙.tsx';
import { scatterInCircle, BlockDebris, type DebrisBirth } from '../零件/方块屑.tsx';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import meta, { feastRounds, feastGapTicks } from './尖牙盛宴.元.ts';
import { mulberry32 } from '@engine/core/数学.ts';

const holdTick = (feastRounds - 1) * feastGapTicks + 1;

const FangFeast: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const facingAngle = gameHorizAngleRad(from, target);
  const debris: DebrisBirth[] = [];
  // 碎屑寿命最长 40 刻，只排还可能活着的那几刻
  for (let t = Math.max(0, Math.floor(tick) - 40); t <= Math.min(tick, holdTick); t++) for (let k = 0; k < 4; k++) debris.push(...scatterInCircle([target[0], target[1], target[2] + 0.25], 1, t, seed * 7919 + t * 4 + k));
  const smokeSpawns: ParticleSpawn[] = [];
  for (let round = 0; round < feastRounds; round++) {
    const r = mulberry32(seed * 53 + round);
    const n = 10 + Math.floor(r() * 35);
    for (let i = 0; i < n; i++) smokeSpawns.push({ 种: 'poof', 刻: round * feastGapTicks, p: [from[0], from[1], from[2]], 种子: seed * 1000 + round * 50 + i });
  }
  return (
    <>
      {Array.from({ length: feastRounds }, (_, round) => (
        <Fang key={round} 位={target} facingAngle={facingAngle} warmup={1} 刻={tick - round * feastGapTicks} />
      ))}
      <CritStar spawns={Array.from({ length: feastRounds }, (_, round) => fangCritSpawns(target, 1, tick - round * feastGapTicks, seed * 100 + round).map((strike) => ({ ...strike, 刻: strike.刻 + round * feastGapTicks }))).flat()} 秒={sec} />
      <BlockDebris spawns={debris} 秒={sec} ground={target[2]} />
      <VanillaParticles spawns={smokeSpawns} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, FangFeast);
