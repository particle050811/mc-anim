// 震颤猛击（goety:temblor_clap_focus）的元数据。出处见 震颤猛击.tsx。
import { defineSpellMeta } from '../接口.ts';

export default defineSpellMeta({
  id: 'temblor_clap',
  长秒: 0.5, // 砸地墙寿命 10 刻
  hitSec: 0,
  // TemblorClapSpell.SpellResult：redstone_explode 音量 2
  sound: [{ asset: '音效/诡厄巫法/goety.redstone_explode.1', sec: 0, 音量: 2 }],
});
