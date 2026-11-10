// 撕咬（goety:biting_focus → FangSpell）的元数据和摆位。出处见 撕咬.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 沿角, 游戏水平角 } from '../零件/地面.ts';

/** SpellStat 默认 range 16：一排 16 颗，第 l 颗离施法者 1.25 × (l + 1) 格、warmup = l 刻 */
export const 撕咬颗数 = 16;
export const 撕咬一排 = (起点: 点, 目标: 点): { 位: 点; 朝角: number; warmup: number }[] => {
  const f = 游戏水平角(起点, 目标);
  return Array.from({ length: 撕咬颗数 }, (_, l) => {
    const [dx, dy] = 沿角(f, 1.25 * (l + 1));
    return { 位: [起点[0] + dx, 起点[1] + dy, 目标[2]] as const, 朝角: f, warmup: l };
  });
};

// 咬到史蒂夫的是离他最近的那颗：开咬（warmup + 1 刻）后第 8 刻结算
const 时长 = (起点: 点, 目标: 点) => {
  const 距 = Math.hypot(目标[0] - 起点[0], 目标[1] - 起点[1]);
  const l = Math.min(撕咬颗数 - 1, Math.max(0, Math.round(距 / 1.25) - 1));
  return { 长秒: (撕咬颗数 + 22 + 12) / 20, 命中秒: (l + 1 + 8) / 20 };
};

export default 定义法术元({
  id: 'biting',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // FangSpell.SpellResult 末尾 playSound(EVOKER_CAST_SPELL)；每颗牙开咬时 EVOKER_FANGS_ATTACK（音高 0.85～1.05，这里记 0.95）
  声音: [
    { 资产: '音效/entity.evoker.cast_spell.1', 秒: 0 },
    ...Array.from({ length: 撕咬颗数 }, (_, l) => ({ 资产: '音效/entity.evoker_fangs.attack', 秒: (l + 1) / 20, 音高: 0.95 })),
  ],
});
