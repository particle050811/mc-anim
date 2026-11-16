// 熔岩炸弹（goety:lavaball_focus）的元数据和弹道。出处见 lavaball.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { fireballShot } from '../零件/甲/火球.ts';

/** 配下界魔杖：3 颗。大火球碰撞箱 1 格见方，离胸口 0.8 格算碰上 */
export const lavaBombShots = (from: Vec3, target: Vec3, seed: number) => fireballShot(from, target, 0, { count: 2, seed: seed, hitRadius: 0.8 });

const duration = (from: Vec3, target: Vec3) => {
  const hitSec = lavaBombShots(from, target, 0)[0]!.flightTick / 20;
  return { 长秒: hitSec + 1.5, hitSec };
};

export default defineSpellMeta({
  id: 'lavaball',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  // LavaballSpell：GHAST_SHOOT 音量 2；命中 Level.explode 的 GENERIC_EXPLODE（音量 4）
  sound: [
    { asset: '音效/entity.ghast.shoot', sec: 0, 音量: 2 },
    { asset: '音效/entity.generic.explode.1', sec: 0, fromHit: true, 音量: 4 },
  ],
});
