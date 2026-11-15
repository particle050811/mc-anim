// 气旋（goety:cyclone_focus）的元数据和弹道。出处见 cyclone.tsx。
import { defineSpellMeta, type SpellOptions, type Vec3 } from '../接口.ts';
import { sub, fireballTrajectory, hitTick } from '../零件/弹道.ts';

/** Cyclone（AbstractCyclone）：惯性 0.68、加速 0.1，贴着地朝目标去（这里朝史蒂夫脚底）；聚晶的高速（Velocity）附魔每级惯性 +0.02（SpellHurtingProjectile.setBoltSpeed：boltSpeed += 等级 / 50） */
export const cyclonePath = (from: Vec3, target: Vec3, highSpeed = 0) => fireballTrajectory(from, sub(target, from), { inertia: 0.68 + highSpeed / 50 });
export const cycloneArriveTick = (from: Vec3, target: Vec3, highSpeed = 0) => hitTick(cyclonePath(from, target, highSpeed), target, 0.5) ?? 200;
/** 卷到人之后 spun 数到 80 就散 */
export const cycloneCurlTicks = 80;

const duration = (from: Vec3, target: Vec3, options?: SpellOptions) => {
  const hitSec = cycloneArriveTick(from, target, options?.highSpeed) / 20;
  return { 长秒: hitSec + cycloneCurlTicks / 20 + 2, hitSec };
};

export default defineSpellMeta({
  id: 'cyclone',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // Cyclone.tick：每 40 刻一声 FLIGHT（音量 0.5、音高 0.5），这里记头两声
  声音: [
    { 资产: '音效/诡厄巫法/goety.flight', 秒: 0, 音量: 0.5, 音高: 0.5 },
    { 资产: '音效/诡厄巫法/goety.flight', 秒: 2, 音量: 0.5, 音高: 0.5 },
  ],
});
