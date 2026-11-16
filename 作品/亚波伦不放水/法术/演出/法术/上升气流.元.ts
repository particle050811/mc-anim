// 上升气流（goety:updraft_focus）的元数据。出处见 上升气流.tsx。
import { defineSpellMeta } from '../接口.ts';

export default defineSpellMeta({
  id: 'updraft',
  长秒: 3.45, // 气流实体活 30 刻，最后一条风带 39 刻才散
  hitSec: 1, // 第 20 刻结算：打伤、往上顶
  // UpdraftBlast 第 1 刻：updraft_blast 音量 0.9、音高 1.5
  sound: [{ asset: '音效/诡厄巫法/goety.updraft_blast.1', sec: 0.05, 音量: 0.9, 音高: 1.5 }],
});
