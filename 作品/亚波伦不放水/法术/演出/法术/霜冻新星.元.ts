// 霜冻新星（goety:frost_nova_focus）的元数据。出处见 霜冻新星.tsx。
import { 定义法术元 } from '../接口.ts';

export default 定义法术元({
  id: 'frost_nova',
  长秒: 2.2, // FROST_NOVA 寿命 4～44 刻，最久的那颗将近 2.2 秒
  命中秒: 0,
  // FrostNovaSpell.SpellResult：ice_chunk_hit 音量 1、音高 0.5
  声音: [{ 资产: '音效/诡厄巫法/goety.ice_chunk_hit', 秒: 0, 音量: 1, 音高: 0.5 }],
});
