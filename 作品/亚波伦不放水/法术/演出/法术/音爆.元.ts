// 音爆（goety:sonic_boom_focus）的元数据。出处见 音爆.tsx。
import { 定义法术元 } from '../接口.ts';

/** 原版 SonicBoomParticle 活 16 刻 */
export const 音爆寿命刻 = 16;

export default 定义法术元({
  id: 'sonic_boom',
  长秒: 音爆寿命刻 / 20,
  命中秒: 0, // 蓄满 60 刻后放出来当刻结算伤害和击退
  // SonicBoomSpell.SpellResult：原版 WARDEN_SONIC_BOOM，音量 3（蓄力时的 WARDEN_SONIC_CHARGE 在出手前，不在这）
  声音: [{ 资产: '音效/entity.warden.sonic_boom.1', 秒: 0, 音量: 3 }],
});
