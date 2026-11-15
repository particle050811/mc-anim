// 释放（goety:discharge_focus）的元数据。出处见 释放.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 冲击波环（ShockwaveParticle）活 30 刻，是这个法术里最后消失的 */
export const releaseRingLifeTicks = 30;

export default defineSpellMeta({
  id: 'discharge',
  长秒: releaseRingLifeTicks / 20,
  hitSec: 0, // 放出来当刻对半径内的生物结算（SpellExplosion）
  // DischargeSpell.SpellResult：REDSTONE_EXPLODE（4 个变体取第 1 个），音量 2
  声音: [{ 资产: '音效/诡厄巫法/goety.redstone_explode.1', 秒: 0, 音量: 2 }],
});
