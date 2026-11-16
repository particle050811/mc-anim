// 冲刺（goety:bolting_focus）的元数据。出处见 冲刺.tsx。
import { defineSpellMeta } from '../接口.ts';

export default defineSpellMeta({
  id: 'bolting',
  长秒: 2, // 风带最长 39 刻才散；冲刺本身五六刻
  hitSec: 0.2, // 冲到目标跟前
  // BoltingSpell：heavy_woosh、redstone_explode，音量都是 3
  sound: [
    { asset: '音效/诡厄巫法/goety.heavy_woosh.1', sec: 0, 音量: 3 },
    { asset: '音效/诡厄巫法/goety.redstone_explode.1', sec: 0, 音量: 3 },
  ],
});
