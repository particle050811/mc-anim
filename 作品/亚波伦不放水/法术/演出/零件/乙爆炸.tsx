// 原版大爆炸的粒子：EXPLOSION_EMITTER（HugeExplosionSeedParticle）。爆炸威力 ≥ 2 时 Explosion.finalizeExplosion 放这个。
// 寿命 8 刻，每刻 6 颗 EXPLOSION，位置 = 中心 ± (随机 − 随机) × 4，大小参数 = 已过刻 ÷ 8（HugeExplosionParticle 的半边长 2 × (1 − 参数 × 0.5)）。
import { rng } from '@engine/model/parts.tsx';
import type { 点 } from '../接口.ts';
import type { ParticleSpawn } from './粒子.tsx';

export const 大爆炸 = (位: 点, 刻: number, 种子: number): ParticleSpawn[] => {
  const r = rng(种子 * 8191 + 3);
  const 出: ParticleSpawn[] = [];
  for (let t = 0; t < 8; t++)
    for (let k = 0; k < 6; k++)
      出.push({ 种: 'explosion', 刻: 刻 + t, p: [位[0] + (r() - r()) * 4, 位[1] + (r() - r()) * 4, 位[2] + (r() - r()) * 4], v: [t / 8, 0, 0], 种子: 种子 * 100 + t * 6 + k });
  return 出;
};
