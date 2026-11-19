// 灵魂束（goety:soul_bolt_focus）的元数据和弹道。出处见 灵魂束.tsx。
import { defineSpellMeta, type SpellOptions, type Vec3 } from '../接口.ts';
import { sub, hitTick, fireballTrajectory } from '../零件/弹道.ts';

/** 打史蒂夫的哪：游戏里弹是朝视线飞的，这里瞄胸口（脚底上 0.9 格） */
export const soulAimPoint = (target: Vec3): Vec3 => [target[0], target[1], target[2] + 0.9];
/** SpellHurtingProjectile：惯性 0.82，加速 0.1（稳态 0.456 格/刻 ≈ 9.1 格/秒）；聚晶的高速（Velocity）附魔每级惯性 +0.02（SpellHurtingProjectile.setBoltSpeed：boltSpeed += 等级 / 50） */
export const soulBeamPath = (from: Vec3, target: Vec3, highSpeed = 0, flightPower = 1) => fireballTrajectory(from, sub(soulAimPoint(target), from), { inertia: 0.82 + highSpeed / 50, accel: 0.1 * flightPower });
/** 碰到史蒂夫的刻：史蒂夫碰撞箱宽 0.6，弹宽 0.3125，取离瞄点 0.45 格算碰上 */
export const soulBeamHitTick = (from: Vec3, target: Vec3, highSpeed = 0, flightPower = 1) => hitTick(soulBeamPath(from, target, highSpeed, flightPower), soulAimPoint(target), 0.45) ?? 200;

// 命中粒子最长活 40 刻（AdditiveSpellParticle 的寿命 8 ÷ (随机 × 0.8 + 0.2)）
const duration = (from: Vec3, target: Vec3, options?: SpellOptions) => {
  const hitSec = soulBeamHitTick(from, target, options?.highSpeed, options?.flightPower) / 20;
  return { 长秒: hitSec + 2, hitSec };
};

export default defineSpellMeta({
  id: 'soul_bolt',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  // SoundUtil.playSoulBolt：三声一起响；命中 SoulBolt.onHit 的 BOLT_IMPACT。同一事件有几个变体的取第 1 个
  sound: [
    { asset: '音效/诡厄巫法/goety.soul_bolt_cast', sec: 0 },
    { asset: '音效/诡厄巫法/goety.vex_vapor.1', sec: 0 },
    { asset: '音效/诡厄巫法/goety.cast_spell_two.1', sec: 0 },
    { asset: '音效/诡厄巫法/goety.bolt_impact.1', sec: 0, fromHit: true },
  ],
});
