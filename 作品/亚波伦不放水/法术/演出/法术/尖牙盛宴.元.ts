// 尖牙盛宴（goety:feast_focus → FeastSpell）的元数据。出处见 尖牙盛宴.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 按住期间隔几刻咬一轮（SpellConfig.FeastDuration 默认 20）；片里演三轮 */
export const feastGapTicks = 20;
export const feastRounds = 3;
/** 每轮那颗牙 warmup 1：轮开始后第 2 刻开咬，再 8 刻结算 */
export const feastBiteTick = (round: number) => round * feastGapTicks + 2;

export default defineSpellMeta({
  id: 'feast',
  长秒: ((feastRounds - 1) * feastGapTicks + 2 + 22 + 12) / 20,
  hitSec: (feastBiteTick(0) + 8) / 20,
  // 起手 CastingSound = EVOKER_PREPARE_ATTACK；每颗牙开咬 EVOKER_FANGS_ATTACK
  声音: [
    { 资产: '音效/entity.evoker.prepare_attack.1', 秒: 0 },
    ...Array.from({ length: feastRounds }, (_, k) => ({ 资产: '音效/entity.evoker_fangs.attack', 秒: feastBiteTick(k) / 20, 音高: 0.95 })),
  ],
});
