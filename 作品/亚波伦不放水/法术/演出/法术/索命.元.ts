// 索命（goety:killing_focus）的元数据。出处见 索命.tsx。
import { defineSpellMeta } from '../接口.ts';

/** SThunderBoltPacket 的寿命 */
export const killingArcTicks = 10;
/** 风带最长活 39 刻（20 + nextInt(20)） */
export const killingWindBandMaxTicks = 40;

export default defineSpellMeta({
  id: 'killing',
  长秒: killingWindBandMaxTicks / 20,
  hitSec: 0, // 蓄满 60 刻后放出来当刻结算
  // KillingSpell.SpellResult：THUNDERBOLT 和原版 LIGHTNING_BOLT_IMPACT，都是音量 3、音高 0.75
  sound: [
    { asset: '音效/诡厄巫法/goety.thunderbolt.1', sec: 0, 音量: 3, 音高: 0.75 },
    { asset: '音效/entity.lightning_bolt.impact.1', sec: 0, 音量: 3, 音高: 0.75 },
  ],
});
