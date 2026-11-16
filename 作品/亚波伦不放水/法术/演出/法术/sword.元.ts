// 魔力剑（goety:sword_focus）的元数据和弹道。出处见 sword.tsx。
import { defineSpellMeta, type SpellOptions, type Vec3 } from '../接口.ts';
import { launchTrajectory, aimPoint } from '../零件/甲/共用.ts';

/** SwordProjectile 是箭一类：shootFromRotation 出手 1.6 格/刻，阻力 0.99、重力 0.05；聚晶的高速（Velocity）附魔每级出手速度 +1/3 格/刻（IceSpikeSpell 等的 velocity += getLevels(VELOCITY) / 3） */
export const magicSwordPath = (from: Vec3, target: Vec3, highSpeed = 0) => launchTrajectory(from, aimPoint(target), 1.6 + highSpeed / 3, { drag: 0.99, 重力: 0.05 });

const duration = (from: Vec3, target: Vec3, options?: SpellOptions) => {
  const hitSec = magicSwordPath(from, target, options?.highSpeed).arriveTick / 20;
  // 附魔台粒子活 30～40 刻
  return { 长秒: hitSec + 2, hitSec };
};

export default defineSpellMeta({
  id: 'sword',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  // SwordSpell：DROWNED_SHOOT；命中 TRIDENT_HIT
  sound: [
    { asset: '音效/entity.drowned.shoot.1', sec: 0 },
    { asset: '音效/item.trident.hit.1', sec: 0, fromHit: true },
  ],
});
