// 雷霆（goety:thunderbolt_focus）的元数据。出处见 雷霆.tsx。
import { 定义法术元, type 点 } from '../接口.ts';

/** SThunderBoltPacket 的寿命：电弧活 10 刻 */
export const 雷霆寿命刻 = 10;
/** 电弧打在目标半身高：ThunderboltSpell 取 目标位置 + 身高 ÷ 2（史蒂夫 1.8 格高） */
export const 雷霆落点 = (目标: 点): 点 => [目标[0], 目标[1], 目标[2] + 0.9];

export default 定义法术元({
  id: 'thunderbolt',
  长秒: 雷霆寿命刻 / 20,
  命中秒: 0, // 射线判定，放出来当刻就结算伤害
  // ThunderboltSpell：施法者处 ModSounds.THUNDERBOLT（3 个变体取第 1 个）
  声音: [{ 资产: '音效/诡厄巫法/goety.thunderbolt.1', 秒: 0 }],
});
