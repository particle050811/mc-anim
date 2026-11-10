// 风爆（goety:wind_blast_focus）的元数据。出处见 风爆.tsx。
import { 定义法术元 } from '../接口.ts';

/** 气浪最长活 39 刻（20 + nextInt(20)） */
export const 风爆最长刻 = 40;

export default 定义法术元({
  id: 'wind_blast',
  长秒: 风爆最长刻 / 20,
  命中秒: 0, // 放出来当刻就把视线上的生物推开
  // WindBlastSpell.SpellResult：WIND_BLAST（3 个变体取第 1 个），音量 0.3、音高 1.3
  声音: [{ 资产: '音效/诡厄巫法/goety.wind_blast.1', 秒: 0, 音量: 0.3, 音高: 1.3 }],
});
