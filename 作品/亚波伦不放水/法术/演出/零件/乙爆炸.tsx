// 原版大爆炸的粒子：EXPLOSION_EMITTER（HugeExplosionSeedParticle）。爆炸威力 ≥ 2 时 Explosion.finalizeExplosion 放这个。
// 寿命 8 刻，每刻 6 颗 EXPLOSION，位置 = 中心 ± (随机 − 随机) × 4，大小参数 = 已过刻 ÷ 8（HugeExplosionParticle 的半边长 2 × (1 − 参数 × 0.5)）。
import type { Vec3 } from '../接口.ts';
import type { ParticleSpawn } from './粒子.tsx';
import { mulberry32 } from '@engine/core/数学.ts';

export const bigExplosion = (pos: Vec3, tick: number, seed: number): ParticleSpawn[] => {
  const r = mulberry32(seed * 8191 + 3);
  const blastSpawns: ParticleSpawn[] = [];
  for (let t = 0; t < 8; t++)
    for (let k = 0; k < 6; k++)
      blastSpawns.push({ kind: 'explosion', 刻: tick + t, p: [pos[0] + (r() - r()) * 4, pos[1] + (r() - r()) * 4, pos[2] + (r() - r()) * 4], v: [t / 8, 0, 0], seed: seed * 100 + t * 6 + k });
  return blastSpawns;
};
