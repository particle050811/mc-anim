// 电刑（goety:electrocute_focus）的元数据和弹道。出处见 electrocute.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { sub, scaleVec, unitVec, straightLine } from '../零件/弹道.ts';
import { endTick, aimPoint } from '../零件/甲/共用.ts';

/** ElectroOrb：出手 0.66 格/刻；有目标时不受重力，直线过去 */
export const electrocutePath = (from: Vec3, target: Vec3) => straightLine(from, scaleVec(unitVec(sub(aimPoint(target), from)), 0.66));
export const electrocuteHitTick = (from: Vec3, target: Vec3) => endTick(electrocutePath(from, target), target, 0.5);

const duration = (from: Vec3, target: Vec3) => {
  const hitSec = electrocuteHitTick(from, target) / 20;
  return { 长秒: hitSec + 0.1, hitSec };
};

export default defineSpellMeta({
  id: 'electrocute',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  // ElectrocuteSpell：SHOCK_CAST；命中 THUNDERBOLT
  sound: [
    { asset: '音效/诡厄巫法/goety.shock_cast.1', sec: 0 },
    { asset: '音效/诡厄巫法/goety.thunderbolt.1', sec: 0, fromHit: true },
  ],
});
