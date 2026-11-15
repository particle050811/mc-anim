// 轰击（goety:bombardment_focus）的元数据和弹道。出处见 bombardment.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { fireballShot } from '../零件/甲/火球.ts';

/** 游戏里按住就一直放；片里一次演 5 发（每 6 刻一发），每发 3 颗 */
export const bombardmentCount = 5;
export const bombardGapTicks = 6;
export const bombardmentShots = (from: Vec3, target: Vec3, seed: number) => Array.from({ length: bombardmentCount }, (_, k) => fireballShot(from, target, k * bombardGapTicks, { count: 2, 种子: seed * 13 + k })).flat();

const duration = (from: Vec3, target: Vec3) => {
  const projectiles = bombardmentShots(from, target, 0);
  const hitSec = projectiles[0]!.flightTick / 20;
  return { 长秒: ((bombardmentCount - 1) * bombardGapTicks) / 20 + hitSec + 1.5, hitSec };
};

export default defineSpellMeta({
  id: 'bombardment',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // BombardmentSpell：每发 BLAZE_SHOOT
  声音: Array.from({ length: bombardmentCount }, (_, k) => ({ 资产: '音效/entity.blaze.shoot', 秒: (k * bombardGapTicks) / 20 })),
});
