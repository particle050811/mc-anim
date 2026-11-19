// 音爆。出处 goety 2.5.60.6：SonicBoomSpell；粒子是原版 SONIC_BOOM（库里照 SonicBoomParticle 抄过）。
// - 放出来的那一刻：从施法者（脚底 + 1.6 格）朝目标眼睛，每隔 1 格放一个音爆粒子，一共 floor(距离) + 7 − 1 个（i 从 1 到 floor(距离) + 6），同一刻全出来，所以会穿过目标再往后 6 格左右。
// 没做：蓄力 60 刻（出手前的事）、目标被击退。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { addVec, sub, scaleVec, vecLength, unitVec } from '../零件/弹道.ts';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import { vanillaParticleAtlas } from '@库/特效/原版粒子.tsx';
import { visibleVanillaParticles } from '@库/特效/原版粒子状态.ts';
import { ParticleQuads, type Particle } from '@库/特效/粒子面片.tsx';
import meta, { receiverWaveSprite, sonicWaveCount } from './音爆.元.ts';

const sonicBoom: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed, options }) => {
  const eye: Vec3 = [target[0], target[1], target[2] + 1.62];
  const startToEyeDiff = sub(eye, from);
  const dir = unitVec(startToEyeDiff);
  const spawnCount = sonicWaveCount(vecLength(startToEyeDiff), options?.receivingSonic);
  const spawns: ParticleSpawn[] = Array.from({ length: spawnCount }, (_, k) => {
    const p = addVec(from, scaleVec(dir, k + 1));
    return { kind: 'sonic_boom', 刻: 0, p: [p[0], p[1], p[2]], seed: seed * 101 + k };
  });
  if (!options?.receivingSonic) return <VanillaParticles spawns={spawns} sec={sec} />;
  const { opaque } = visibleVanillaParticles(spawns, sec * 20);
  const fronts = opaque.flatMap((state, index): Particle[] => {
    const sprite = receiverWaveSprite(spawnCount - 1 - index, sec);
    if (!sprite) return [];
    const native = sprite === 'native';
    return [{ p: state.p, uv: vanillaParticleAtlas.uv[native ? state.tex : sprite],
      half: state.half * (native ? 1 : 0.92 + 0.42 * sec), color: native ? state.color : [1, 1, 1], alpha: state.alpha }];
  });
  return <ParticleQuads tex={vanillaParticleAtlas.tex} items={fronts} />;
};

export default defineSpellPerformance(meta, sonicBoom);
