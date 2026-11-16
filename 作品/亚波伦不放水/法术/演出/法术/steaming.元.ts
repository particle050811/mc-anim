// 蒸汽（goety:steaming_focus）的元数据和弹道。出处见 steaming.tsx。
import { mulberry32 } from '@engine/core/数学.ts';
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { sub, unitVec, fireballTrajectory, type Trajectory } from '../零件/弹道.ts';
import { endTick, aimPoint } from '../零件/甲/共用.ts';

/** 不配对应法杖：一共 5 发，每 2 刻一发 */
export const steamCount = 5;
export const steamGapTicks = 2;
/** SteamMissile（SpellHurtingProjectile，惯性 0.82）；方向 = 视线单位向量，水平两个分量各加一个三角分布 triangle(0, 0.1378) */
export const steamShots = (from: Vec3, target: Vec3, seed: number): { launchTick: number; trajectory: Trajectory; flightTick: number }[] => {
  const r = mulberry32(seed * 97 + 11);
  const dir = unitVec(sub(aimPoint(target), from));
  return Array.from({ length: steamCount }, (_, k) => {
    const jitter = () => 0.1378 * (r() - r());
    const trajectory = fireballTrajectory(from, [dir[0] + jitter(), dir[1] + jitter(), dir[2]], { inertia: 0.82 });
    return { launchTick: k * steamGapTicks, trajectory, flightTick: endTick(trajectory, target, 0.5) };
  });
};

const duration = (from: Vec3, target: Vec3) => {
  const projectiles = steamShots(from, target, 1);
  const hitSec = Math.min(...projectiles.map((projectile) => projectile.launchTick + projectile.flightTick)) / 20;
  return { 长秒: Math.max(...projectiles.map((projectile) => projectile.launchTick + projectile.flightTick)) / 20 + 0.1, hitSec };
};

export default defineSpellMeta({
  id: 'steaming',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  // SteamSpell：每发 CAST_STEAM；命中 STEAM_IMPACT
  sound: [
    ...Array.from({ length: steamCount }, (_, k) => ({ asset: `音效/诡厄巫法/goety.cast_steam.${(k % 4) + 1}`, sec: (k * steamGapTicks) / 20 })),
    { asset: '音效/诡厄巫法/goety.steam_impact.1', sec: 0, fromHit: true },
  ],
});
