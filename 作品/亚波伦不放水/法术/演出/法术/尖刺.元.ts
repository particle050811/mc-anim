// 尖刺（goety:shredding_focus → SpikeSpell）的元数据和摆位。出处见 尖刺.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { dirFromAngle, gameHorizAngleRad } from '../零件/地面.ts';

export const spikeCount = 16;
/** 游戏里 Spike.lifeTicks = 600（地刺立 30 秒）；片里缩到 100 刻（自己定的，齐放里一招占不了 30 秒），升起、缩回的动作照游戏 */
export const spikeLifeTicks = 100;
export const spikeRow = (from: Vec3, target: Vec3): { 位: Vec3; facingAngle: number; warmup: number }[] => {
  const f = gameHorizAngleRad(from, target);
  return Array.from({ length: spikeCount }, (_, l) => {
    const [dx, dy] = dirFromAngle(f, 1.25 * (l + 1));
    return { 位: [from[0] + dx, from[1] + dy, target[2]] as const, facingAngle: f, warmup: l };
  });
};

// 地刺出土那一刻起每刻都伤碰到的人：命中 = 离目标最近那根出土
const duration = (from: Vec3, target: Vec3) => {
  const distance = Math.hypot(target[0] - from[0], target[1] - from[1]);
  const l = Math.min(spikeCount - 1, Math.max(0, Math.round(distance / 1.25) - 1));
  return { 长秒: (spikeCount + 1 + spikeLifeTicks) / 20, hitSec: (l + 1) / 20 };
};

export default defineSpellMeta({
  id: 'shredding',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // SpikeSpell：playSound(EVOKER_CAST_SPELL, 1, 0.5)；每根出土 GRINDSTONE_USE（音高 0.85～1.05）
  声音: [
    { 资产: '音效/entity.evoker.cast_spell.1', 秒: 0, 音高: 0.5 },
    ...Array.from({ length: spikeCount }, (_, l) => ({ 资产: '音效/block.grindstone.use.1', 秒: (l + 1) / 20, 音高: 0.95 })),
  ],
});
