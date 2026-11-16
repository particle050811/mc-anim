// 魔弹。出处 goety 2.5.60.6：MagicBoltSpell、MagicBolt（SpellHurtingProjectile）、SoulBulletRenderer（什么都不画）、RollingParticle、MagicGround、ServerParticleUtil.circularParticles。
// - 弹没有模型，只有粒子：每刻在 位置 + 速度（竖直再 + 0.5）放一颗 magic_bolt 粒子（RollingParticle：不动，半边长 0.5 格在 20 刻里缩到 0，满亮度、半透明，带一个随机的自转），
//   再在 位置 + (随机 ÷ 2, 0.5, 随机 ÷ 2) 放一颗 witch。
// - 命中：原地留一个 MagicGround（半径 1，100 刻），每刻在半径 0.5 的圆里撒 witch（π × 0.5² < 1，一刻一颗）。
// 没做：MagicGround 有 5% 的刻会多撒一片 witch；MagicGround 自己不画东西。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { sub } from '../零件/弹道.ts';
import { VanillaParticles, TexturedParticles, type ParticleSpawn, type ParticleBirth, type ParticleClass } from '../零件/粒子.tsx';
import { eachTick, trajectoryAt } from '../零件/甲/共用.ts';
import meta, { magicBoltHitTick, magicBoltGroundTick, magicBoltPath } from './magic_bolt.元.ts';
import magicBoltParticlePng from 'asset:贴图/法术/goety/particle/magic_bolt';
import { mulberry32 } from '@engine/core/数学.ts';

const magicBoltParticleClass: ParticleClass = { frame: [png(magicBoltParticlePng)], 选帧: '按年龄', 摩擦: 1, blend: '半透明', size: (age, lifetime) => Math.max(0, 1 - age / lifetime) };

const MagicBolt: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => {
  const tick = sec * 20;
  const trajectory = magicBoltPath(from, target);
  const hitTick = magicBoltHitTick(from, target);
  const hitPos = trajectoryAt(trajectory, hitTick);
  const r = mulberry32(seed * 7 + 5);
  const boltSpawns: ParticleBirth[] = [];
  const witchSpawns: ParticleSpawn[] = [];
  for (const n of eachTick(1, Math.min(tick, hitTick))) {
    const [pos, speedVec] = [trajectory(n), sub(trajectory(n + 1), trajectory(n))];
    // roll 每刻 += 2π × rotSpeed（±0.05），这里只给出生时的随机角，不转
    boltSpawns.push({ 刻: n, 位: [pos[0] + speedVec[0], pos[1] + speedVec[1], pos[2] + speedVec[2] + 0.5], 寿命: 20, radius: 0.5, angleRad: r() * Math.PI * 2 });
    witchSpawns.push({ kind: 'witch', 刻: n, p: [pos[0] + r() / 2, pos[1] - r() / 2, pos[2] + 0.5], seed: seed * 61 + n });
  }
  for (const n of eachTick(hitTick, Math.min(tick, hitTick + magicBoltGroundTick))) {
    const [angle, randDistance] = [r() * Math.PI * 2, Math.sqrt(r()) * 0.5];
    witchSpawns.push({ kind: 'witch', 刻: n, p: [hitPos[0] + Math.cos(angle) * randDistance, hitPos[1] + Math.sin(angle) * randDistance, target[2]], seed: seed * 67 + n });
  }
  return (
    <>
      <TexturedParticles type={magicBoltParticleClass} spawns={boltSpawns} sec={sec} />
      <VanillaParticles spawns={witchSpawns} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, MagicBolt);
