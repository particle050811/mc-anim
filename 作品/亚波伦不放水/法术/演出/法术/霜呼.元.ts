// 霜呼（goety:frost_breath_focus）的元数据。出处见 霜呼.tsx。
import { 定义法术元 } from '../接口.ts';

/** 游戏里按住多久喷多久；片里喷这么多刻（自己定的） */
export const 霜呼持续刻 = 50;
/** 一颗粒子活多少刻 */
export const 霜呼粒子寿命 = 20;

export default 定义法术元({
  id: 'frost_breath',
  长秒: (霜呼持续刻 + 霜呼粒子寿命) / 20,
  命中秒: 0, // 每刻对视线前方一段锥形里的生物结算
  // FrostBreathSpell.SpellResult：每刻在施法者处响 FROST_BREATH，音量、音高都是 随机 × 0.5（这里取中间 0.25；音高低于 0.5 的游戏里按 0.5 放）
  声音: Array.from({ length: 霜呼持续刻 }, (_, n) => ({ 资产: '音效/诡厄巫法/goety.frost_breath', 秒: n / 20, 音量: 0.25, 音高: 0.5 })),
});
