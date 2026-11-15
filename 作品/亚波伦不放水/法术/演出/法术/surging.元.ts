// 电涌（goety:surging_focus）的元数据和弹道。出处见 surging.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { sub, fireballTrajectory, type Trajectory } from '../零件/弹道.ts';
import { endTick, aimPoint } from '../零件/甲/共用.ts';

/** 游戏里按住每 6 刻放一颗；片里一次演 3 颗 */
export const surgeCount = 3;
export const surgeGapTicks = 6;
/** SurgingOrb（SpellHurtingProjectile，惯性 0.82）；会追踪，目标不动时就是直线 */
export const surgeShots = (from: Vec3, target: Vec3): { launchTick: number; trajectory: Trajectory; flightTick: number }[] => {
  const trajectory = fireballTrajectory(from, sub(aimPoint(target), from), { inertia: 0.82 });
  const flightTick = endTick(trajectory, target, 0.5);
  return Array.from({ length: surgeCount }, (_, k) => ({ launchTick: k * surgeGapTicks, trajectory, flightTick }));
};

const duration = (from: Vec3, target: Vec3) => {
  const projectiles = surgeShots(from, target);
  const hitSec = projectiles[0]!.flightTick / 20;
  // 命中的电弧活 8 刻、球爆 6 刻
  return { 长秒: hitSec + ((surgeCount - 1) * surgeGapTicks + 10) / 20, hitSec };
};

export default defineSpellMeta({
  id: 'surging',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // SurgingSpell：每颗 SHOCK_CAST；命中 THUNDERBOLT
  声音: [
    ...Array.from({ length: surgeCount }, (_, k) => ({ 资产: `音效/诡厄巫法/goety.shock_cast.${k + 1}`, 秒: (k * surgeGapTicks) / 20 })),
    ...Array.from({ length: surgeCount }, (_, k) => ({ 资产: `音效/诡厄巫法/goety.thunderbolt.${k + 1}`, 秒: (k * surgeGapTicks) / 20, fromHit: true })),
  ],
});
