// 音爆（goety:sonic_boom_focus）的元数据。出处见 音爆.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 原版 SonicBoomParticle 活 16 刻 */
export const sonicBoomLifeTicks = 16;

export const sonicWaveCount = (distance: number, receiving = false) =>
  Math.max(0, Math.floor(distance + (receiving ? -3.5 : 6)));

const nearFronts = new Set([0, 3, 8, 15, 25]);
export const receiverWaveSprite = (blocksBehindFront: number, sec: number) => {
  if (blocksBehindFront > 25) return 'native';
  if (!nearFronts.has(blocksBehindFront) || sec < 0 || sec >= sonicBoomLifeTicks / 20) return null;
  return `sonic_boom_${9 + Math.floor(sec * 20 / sonicBoomLifeTicks * 7)}`;
};

export default defineSpellMeta({
  id: 'sonic_boom',
  长秒: sonicBoomLifeTicks / 20,
  hitSec: 0, // 蓄满 60 刻后放出来当刻结算伤害和击退
  // SonicBoomSpell.SpellResult：原版 WARDEN_SONIC_BOOM，音量 3（蓄力时的 WARDEN_SONIC_CHARGE 在出手前，不在这）
  sound: [{ asset: '音效/entity.warden.sonic_boom.1', sec: 0, 音量: 3 }],
});
