// 音爆。出处 goety 2.5.60.6：SonicBoomSpell；粒子是原版 SONIC_BOOM（库里照 SonicBoomParticle 抄过）。
// - 放出来的那一刻：从施法者（脚底 + 1.6 格）朝目标眼睛，每隔 1 格放一个音爆粒子，一共 floor(距离) + 7 − 1 个（i 从 1 到 floor(距离) + 6），同一刻全出来，所以会穿过目标再往后 6 格左右。
// 没做：蓄力 60 刻（出手前的事）、目标被击退。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { addVec, sub, scaleVec, vecLength, unitVec } from '../零件/弹道.ts';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import meta from './音爆.元.ts';

const sonicBoom: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => {
  const eye: Vec3 = [target[0], target[1], target[2] + 1.62];
  const startToEyeDiff = sub(eye, from);
  const dir = unitVec(startToEyeDiff);
  const spawnCount = Math.floor(vecLength(startToEyeDiff)) + 6;
  const spawns: ParticleSpawn[] = Array.from({ length: spawnCount }, (_, k) => {
    const p = addVec(from, scaleVec(dir, k + 1));
    return { kind: 'sonic_boom', 刻: 0, p: [p[0], p[1], p[2]], seed: seed * 101 + k };
  });
  return <VanillaParticles spawns={spawns} sec={sec} />;
};

export default defineSpellPerformance(meta, sonicBoom);
