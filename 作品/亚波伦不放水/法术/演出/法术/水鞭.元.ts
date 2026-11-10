// 水鞭（goety:water_whip_focus → GulfTentacleSpell）的元数据。出处见 水鞭.tsx。
import { 定义法术元 } from '../接口.ts';

/** GulfTentacle：life ≥ 20 消失；第 8～11 刻沿视线查伤害 */
export const 鞭寿命刻 = 20;
export const 鞭伤害刻 = 8;
/** 实体的 RANGE 默认 4 格（模型长 3 格 × range ÷ 4） */
export const 鞭射程 = 4;

export default 定义法术元({
  id: 'water_whip',
  长秒: 鞭寿命刻 / 20,
  // 不写命中秒：鞭子只够到施法者面前 4 格，够不够得着看正片怎么站。打中时另有 WHIP_HIT（goety.whip_hit.1），段里够得着时自己加
  声音: [{ 资产: '音效/诡厄巫法/goety.whip_swing.1', 秒: 0 }],
});
