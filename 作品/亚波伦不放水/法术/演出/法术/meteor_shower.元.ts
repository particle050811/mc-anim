// 流星雨（goety:meteor_shower_focus）的元数据和弹道。出处见 meteor_shower.tsx。
import { mulberry32 } from '@engine/core/数学.ts';
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { sub, fireballTrajectory } from '../零件/弹道.ts';
import { endTick, aimPoint } from '../零件/甲/共用.ts';
import type { Fireball } from '../零件/甲/火球.ts';

/** 游戏里按住每 10 刻一轮；片里一次演 3 轮。配下界魔杖每轮 3 颗 */
export const meteorRounds = 3;
export const meteorGapTicks = 10;
/** 每颗生在目标上方 15 格的中心 + (±12, ±2, ±12)，是熔岩炸弹（Lavaball），朝目标飞 */
export const meteorShots = (target: Vec3, seed: number): (Fireball & { spawnPos: Vec3 })[] => {
  const r = mulberry32(seed * 73 + 17);
  const jitter = (a: number) => (r() * 2 - 1) * a;
  return Array.from({ length: meteorRounds * 3 }, (_, k) => {
    const spawnPos: Vec3 = [target[0] + jitter(12), target[1] + jitter(12), target[2] + 15 + jitter(2)];
    const trajectory = fireballTrajectory(spawnPos, sub(aimPoint(target), spawnPos));
    return { launchTick: Math.floor(k / 3) * meteorGapTicks, spawnPos, trajectory, flightTick: endTick(trajectory, target, 0.8) };
  });
};

const duration = (unusedStart: Vec3, target: Vec3) => {
  const landTicks = meteorShots(target, 1).map((projectile) => projectile.launchTick + projectile.flightTick);
  return { 长秒: Math.max(...landTicks) / 20 + 1.5, hitSec: Math.min(...landTicks) / 20 };
};

export default defineSpellMeta({
  id: 'meteor_shower',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  // MeteorShowerSpell：每轮 GHAST_SHOOT 音量 2；命中爆炸 GENERIC_EXPLODE（只挂了第一颗）
  sound: [
    ...Array.from({ length: meteorRounds }, (_, k) => ({ asset: '音效/entity.ghast.shoot', sec: (k * meteorGapTicks) / 20, 音量: 2 })),
    { asset: '音效/entity.generic.explode.1', sec: 0, fromHit: true, 音量: 4 },
  ],
});
