// 冰风暴（goety:ice_storm_focus）的元数据和弹道。出处见 ice_storm.tsx。
import { defineSpellMeta, type SpellOptions, type Vec3 } from '../接口.ts';
import { sub, fireballTrajectory, hitTick } from '../零件/弹道.ts';
import { trajectoryGroundTick, aimPoint } from '../零件/甲/共用.ts';

/** IceStorm（SpellHurtingProjectile）：惯性 0.68、加速 0.1（稳态 0.2125 格/刻，很慢）；活 100 刻，穿过人不停，这里飞到落地或 100 刻；聚晶的高速（Velocity）附魔每级惯性 +0.02（SpellHurtingProjectile.setBoltSpeed：boltSpeed += 等级 / 50） */
export const iceStormPath = (from: Vec3, target: Vec3, highSpeed = 0) => fireballTrajectory(from, sub(aimPoint(target), from), { inertia: 0.68 + highSpeed / 50 });
export const iceStormEndTick = (from: Vec3, target: Vec3, highSpeed = 0) => Math.min(100, trajectoryGroundTick(iceStormPath(from, target, highSpeed), target[2], 100) ?? 100);

const duration = (from: Vec3, target: Vec3, options?: SpellOptions) => {
  const endTick = iceStormEndTick(from, target, options?.highSpeed);
  // 越飞越大（碰撞箱跟着 size 长），离胸口 1 格算卷到
  const hitSec = Math.min(endTick, hitTick(iceStormPath(from, target, options?.highSpeed), aimPoint(target), 1, 100) ?? endTick) / 20;
  return { 长秒: endTick / 20 + 1.5, hitSec };
};

export default defineSpellMeta({
  id: 'ice_storm',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // IceStormSpell：WIND_BLAST 音高 0.75
  声音: [{ 资产: '音效/诡厄巫法/goety.wind_blast.1', 秒: 0, 音高: 0.75 }],
});
