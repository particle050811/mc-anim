// 腐化（goety:corruption_focus）的元数据。出处见 腐化.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { addVec, sub, scaleVec, unitVec } from '../零件/弹道.ts';

/** 游戏里按住多久放多久；片里放这么多秒（自己定的） */
export const corruptDurSec = 3;

/**
 * 光束两头：从起点朝目标半身高直着穿过去，打到地面（目标脚底那个高度）为止，最长 64 格。
 * 游戏里光束沿视线走到第一个方块，生物挡不住它（beamTraceDistance(64, 1, false)）。
 */
export const corruptBeam = (from: Vec3, target: Vec3): { 起: Vec3; end: Vec3; 长: number } => {
  const dir = unitVec(sub([target[0], target[1], target[2] + 0.9], from));
  const length = dir[2] < 0 ? Math.min(64, (target[2] - from[2]) / dir[2]) : 64;
  return { 起: from, end: addVec(from, scaleVec(dir, length)), 长: length };
};

export default defineSpellMeta({
  id: 'corruption',
  长秒: corruptDurSec,
  hitSec: 0, // 光束出来就扫到，之后每刻结算
  // CorruptedBeamSpell.CastingSound：CORRUPT_BEAM_START（2 个变体取第 1 个）
  声音: [{ 资产: '音效/诡厄巫法/goety.corrupt_beam_start.1', 秒: 0 }],
});
