// 牙之（goety:teeth_focus → TeethSpell）的元数据和时序。出处见 牙之.tsx。
import { 定义法术元 } from '../接口.ts';

/** 悬停：非困难难度 3 秒（hovering > 60 才开始落）；头 20 刻从小长到满 */
export const 大牙悬停刻 = 60;
/** 出生在目标那格往上 8 格的格子中心（上面没东西挡时） */
export const 大牙出生高 = 8.5;
/** 开落后每刻速度再加 0.25 格/刻：第 k 刻落了 0.125 × k × (k + 1) 格 */
export const 大牙高 = (刻: number) => {
  const k = Math.max(0, 刻 - 大牙悬停刻);
  return 大牙出生高 - 0.125 * k * (k + 1);
};
/** 砸到史蒂夫头顶（1.8 格）的那一刻：整刻里第一个落到头顶以下的 */
export const 大牙命中刻 = (() => {
  let n = 大牙悬停刻;
  while (大牙高(n) > 1.8) n++;
  return n;
})();
/** 尖桩：出生后 22 刻消失，第 2 刻结算伤害 */
export const 尖桩寿命刻 = 22;

export default 定义法术元({
  id: 'teeth',
  长秒: (大牙命中刻 + 1 + 尖桩寿命刻 + 20) / 20,
  命中秒: 大牙命中刻 / 20,
  // TeethSpell：大牙出生 TOOTH_SPAWN，施法者 EVOKER_CAST_SPELL；ViciousTooth.onHit：ZOMBIE_BREAK_WOODEN_DOOR（音高 0.5）；四根尖桩各一声 IMPALE（音高 0.85～1.05）
  声音: [
    { 资产: '音效/诡厄巫法/goety.tooth_spawn.1', 秒: 0 },
    { 资产: '音效/entity.evoker.cast_spell.1', 秒: 0 },
    { 资产: '音效/entity.zombie.break_wooden_door', 秒: 大牙命中刻 / 20, 音高: 0.5 },
    ...[0, 1, 2, 3].map(() => ({ 资产: '音效/诡厄巫法/goety.impale', 秒: (大牙命中刻 + 1) / 20, 音高: 0.95 })),
  ],
});
