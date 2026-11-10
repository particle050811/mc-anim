// 索命（goety:killing_focus）的元数据。出处见 索命.tsx。
import { 定义法术元 } from '../接口.ts';

/** SThunderBoltPacket 的寿命 */
export const 索命电弧刻 = 10;
/** 风带最长活 39 刻（20 + nextInt(20)） */
export const 索命风带最长刻 = 40;

export default 定义法术元({
  id: 'killing',
  长秒: 索命风带最长刻 / 20,
  命中秒: 0, // 蓄满 60 刻后放出来当刻结算
  // KillingSpell.SpellResult：THUNDERBOLT 和原版 LIGHTNING_BOLT_IMPACT，都是音量 3、音高 0.75
  声音: [
    { 资产: '音效/诡厄巫法/goety.thunderbolt.1', 秒: 0, 音量: 3, 音高: 0.75 },
    { 资产: '音效/entity.lightning_bolt.impact.1', 秒: 0, 音量: 3, 音高: 0.75 },
  ],
});
