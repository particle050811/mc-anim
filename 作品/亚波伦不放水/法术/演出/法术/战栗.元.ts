// 战栗（goety:trembling_focus）的元数据。出处见 战栗.tsx。
import { 定义法术元 } from '../接口.ts';

export default 定义法术元({
  id: 'trembling',
  长秒: 0.5, // 圆环速度 3，30 寿命每刻走 4，8 刻放完；砸地墙寿命 10 刻
  命中秒: 0,
  // WindHornSpell.SpellResult：wind_horn 音量 3
  声音: [{ 资产: '音效/诡厄巫法/goety.wind_horn', 秒: 0, 音量: 3 }],
});
