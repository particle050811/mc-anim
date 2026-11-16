// 凋灵之首（goety:wither_skull_focus）的元数据和弹道。出处见 wither_skull.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { fireballShot } from '../零件/甲/火球.ts';

/** 原版 WitherSkull：惯性 0.95（同火球）；0.73 是潜行施放的「危险凋灵之首」（WitherSkullSpell 只在 isShifting 时 setDangerous），片里不潜行。配下界魔杖 3 颗 */
export const witherSkullShots = (from: Vec3, target: Vec3, seed: number) => fireballShot(from, target, 0, { count: 2, seed: seed });

const duration = (from: Vec3, target: Vec3) => {
  const hitSec = witherSkullShots(from, target, 0)[0]!.flightTick / 20;
  return { 长秒: hitSec + 1.5, hitSec };
};

export default defineSpellMeta({
  id: 'wither_skull',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  // WitherSkullSpell：WITHER_SHOOT 音量 2；命中爆炸 GENERIC_EXPLODE
  sound: [
    { asset: '音效/entity.wither.shoot', sec: 0, 音量: 2 },
    { asset: '音效/entity.generic.explode.1', sec: 0, fromHit: true, 音量: 4 },
  ],
});
