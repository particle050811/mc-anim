// 震颤猛击（goety:temblor_clap_focus）的元数据。出处见 震颤猛击.tsx。
import { 定义法术元 } from '../接口.ts';

export default 定义法术元({
  id: 'temblor_clap',
  长秒: 0.5, // 砸地墙寿命 10 刻
  命中秒: 0,
  // TemblorClapSpell.SpellResult：redstone_explode 音量 2
  声音: [{ 资产: '音效/诡厄巫法/goety.redstone_explode.1', 秒: 0, 音量: 2 }],
});
