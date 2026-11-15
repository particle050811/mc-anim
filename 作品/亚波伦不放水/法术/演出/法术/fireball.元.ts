// 火球术（goety:fireball_focus）的元数据和弹道。出处见 fireball.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { fireballShot } from '../零件/甲/火球.ts';

/** 配下界魔杖：3 颗 */
export const fireballShots = (from: Vec3, target: Vec3, seed: number) => fireballShot(from, target, 0, { count: 2, 种子: seed });

const duration = (from: Vec3, target: Vec3) => {
  const hitSec = fireballShots(from, target, 0)[0]!.flightTick / 20;
  // 两边的两颗偏出去最多两三格，晚不了几刻；烟活 8～40 刻
  return { 长秒: hitSec + 1.5, hitSec };
};

export default defineSpellMeta({
  id: 'fireball',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // FireballSpell：BLAZE_SHOOT 音量 2
  声音: [{ 资产: '音效/entity.blaze.shoot', 秒: 0, 音量: 2 }],
});
