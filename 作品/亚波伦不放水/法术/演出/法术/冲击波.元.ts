// 冲击波（goety:shockwave_focus）的元数据。出处见 冲击波.tsx。
import { 定义法术元 } from '../接口.ts';

export default 定义法术元({
  id: 'shockwave',
  长秒: 0.75, // 圆环 CircleExplode 速度 1，30 寿命每刻走 2，15 刻放完
  命中秒: 0, // 放出来当刻 SpellExplosion 结算
  // ShockwaveSpell.SpellResult：soul_explode 音量 2
  声音: [{ 资产: '音效/诡厄巫法/goety.soul_explode.1', 秒: 0, 音量: 2 }],
});
