// 冲刺（goety:bolting_focus）的元数据。出处见 冲刺.tsx。
import { 定义法术元 } from '../接口.ts';

export default 定义法术元({
  id: 'bolting',
  长秒: 2, // 风带最长 39 刻才散；冲刺本身五六刻
  命中秒: 0.2, // 冲到目标跟前
  // BoltingSpell：heavy_woosh、redstone_explode，音量都是 3
  声音: [
    { 资产: '音效/诡厄巫法/goety.heavy_woosh.1', 秒: 0, 音量: 3 },
    { 资产: '音效/诡厄巫法/goety.redstone_explode.1', 秒: 0, 音量: 3 },
  ],
});
