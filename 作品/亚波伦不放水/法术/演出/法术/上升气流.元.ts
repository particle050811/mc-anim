// 上升气流（goety:updraft_focus）的元数据。出处见 上升气流.tsx。
import { 定义法术元 } from '../接口.ts';

export default 定义法术元({
  id: 'updraft',
  长秒: 3.45, // 气流实体活 30 刻，最后一条风带 39 刻才散
  命中秒: 1, // 第 20 刻结算：打伤、往上顶
  // UpdraftBlast 第 1 刻：updraft_blast 音量 0.9、音高 1.5
  声音: [{ 资产: '音效/诡厄巫法/goety.updraft_blast.1', 秒: 0.05, 音量: 0.9, 音高: 1.5 }],
});
