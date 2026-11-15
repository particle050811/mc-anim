// 炎呼（goety:fire_breath_focus）的元数据。出处见 炎呼.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 游戏里按住多久喷多久；片里喷这么多刻（自己定的） */
export const fireBreathDurTicks = 50;
/** 一颗粒子活多少刻 */
export const fireBreathParticleLifeTicks = 14;

export default defineSpellMeta({
  id: 'fire_breath',
  长秒: (fireBreathDurTicks + fireBreathParticleLifeTicks) / 20,
  hitSec: 0, // 每刻对视线前方一段锥形里的生物结算
  // FireBreathSpell：CastingSound = FIRE_BREATH_START，loopSound = FIRE_BREATH 循环着响（这里只在开头各放一次，循环由段里定）
  声音: [
    { 资产: '音效/诡厄巫法/goety.fire_breath_start', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.fire_breath', 秒: 0 },
  ],
});
