// 魔弹（goety:magic_bolt_focus）的元数据和弹道。出处见 magic_bolt.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { sub, fireballTrajectory } from '../零件/弹道.ts';
import { endTick, aimPoint } from '../零件/甲/共用.ts';

/** MagicBolt（SpellHurtingProjectile）：惯性 0.82、加速 0.1 */
export const magicBoltPath = (from: Vec3, target: Vec3) => fireballTrajectory(from, sub(aimPoint(target), from), { inertia: 0.82 });
/** 实体 0.625 格见方，离胸口 0.6 格算碰上 */
export const magicBoltHitTick = (from: Vec3, target: Vec3) => endTick(magicBoltPath(from, target), target, 0.6);
/** 命中后留在地上的 MagicGround 活 100 刻 */
export const magicBoltGroundTick = 100;

const duration = (from: Vec3, target: Vec3) => {
  const hitSec = magicBoltHitTick(from, target) / 20;
  return { 长秒: hitSec + magicBoltGroundTick / 20 + 1, hitSec };
};

export default defineSpellMeta({
  id: 'magic_bolt',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // MagicBoltSpell：CAST_SPELL
  声音: [{ 资产: '音效/诡厄巫法/goety.cast_spell.1', 秒: 0 }],
});
