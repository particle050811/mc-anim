// 弱化（goety:weakening_focus）的元数据。出处见 弱化.tsx。
import { 定义法术元 } from '../接口.ts';

export default 定义法术元({
  id: 'weakening',
  长秒: 2, // SPELL_SQUARE 寿命 8～40 刻，最久那颗到 2 秒
  命中秒: 0,
  // WeakeningSpell.SpellResult：weaken_cast 音量 2（4 个变体取第 1 个）；受害者身上的 weaken_curse 这里没有受害者
  声音: [{ 资产: '音效/诡厄巫法/goety.weaken_cast.1', 秒: 0, 音量: 2 }],
});
