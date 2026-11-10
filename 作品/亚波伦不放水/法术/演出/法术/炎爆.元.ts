// 炎爆（goety:fire_blast_focus）的元数据。出处见 炎爆.tsx。
import { 定义法术元 } from '../接口.ts';

export default 定义法术元({
  id: 'fire_blast',
  长秒: 0.75, // 冲击波环速度 1，15 刻放完；大火最晚在第 0 刻出生，寿命 8 刻
  命中秒: 0,
  // FireBlastSpell.SpellResult：原版 GENERIC_EXPLODE 音量 2，加 hell_blast_impact 音量 2
  声音: [
    { 资产: '音效/entity.generic.explode.1', 秒: 0, 音量: 2 },
    { 资产: '音效/诡厄巫法/goety.hell_blast_impact.1', 秒: 0, 音量: 2 },
  ],
});
