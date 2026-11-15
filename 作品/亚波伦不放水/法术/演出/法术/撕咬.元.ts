// 撕咬（goety:biting_focus → FangSpell）的元数据和摆位。出处见 撕咬.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { dirFromAngle, gameHorizAngleRad } from '../零件/地面.ts';

/** SpellStat 默认 range 16：一排 16 颗，第 l 颗离施法者 1.25 × (l + 1) 格、warmup = l 刻 */
export const biteCount = 16;
export const biteRow = (from: Vec3, target: Vec3): { 位: Vec3; facingAngle: number; warmup: number }[] => {
  const f = gameHorizAngleRad(from, target);
  return Array.from({ length: biteCount }, (_, l) => {
    const [dx, dy] = dirFromAngle(f, 1.25 * (l + 1));
    return { 位: [from[0] + dx, from[1] + dy, target[2]] as const, facingAngle: f, warmup: l };
  });
};

// 咬到史蒂夫的是离他最近的那颗：开咬（warmup + 1 刻）后第 8 刻结算
const duration = (from: Vec3, target: Vec3) => {
  const distance = Math.hypot(target[0] - from[0], target[1] - from[1]);
  const l = Math.min(biteCount - 1, Math.max(0, Math.round(distance / 1.25) - 1));
  return { 长秒: (biteCount + 22 + 12) / 20, hitSec: (l + 1 + 8) / 20 };
};

export default defineSpellMeta({
  id: 'biting',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // FangSpell.SpellResult 末尾 playSound(EVOKER_CAST_SPELL)；每颗牙开咬时 EVOKER_FANGS_ATTACK（音高 0.85～1.05，这里记 0.95）
  声音: [
    { 资产: '音效/entity.evoker.cast_spell.1', 秒: 0 },
    ...Array.from({ length: biteCount }, (_, l) => ({ 资产: '音效/entity.evoker_fangs.attack', 秒: (l + 1) / 20, 音高: 0.95 })),
  ],
});
