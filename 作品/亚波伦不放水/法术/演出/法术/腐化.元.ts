// 腐化（goety:corruption_focus）的元数据。出处见 腐化.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 加, 减, 乘, 单位 } from '../零件/弹道.ts';

/** 游戏里按住多久放多久；片里放这么多秒（自己定的） */
export const 腐化持续秒 = 3;

/**
 * 光束两头：从起点朝目标半身高直着穿过去，打到地面（目标脚底那个高度）为止，最长 64 格。
 * 游戏里光束沿视线走到第一个方块，生物挡不住它（beamTraceDistance(64, 1, false)）。
 */
export const 腐化束 = (起点: 点, 目标: 点): { 起: 点; 终: 点; 长: number } => {
  const 向 = 单位(减([目标[0], 目标[1], 目标[2] + 0.9], 起点));
  const 长 = 向[2] < 0 ? Math.min(64, (目标[2] - 起点[2]) / 向[2]) : 64;
  return { 起: 起点, 终: 加(起点, 乘(向, 长)), 长 };
};

export default 定义法术元({
  id: 'corruption',
  长秒: 腐化持续秒,
  命中秒: 0, // 光束出来就扫到，之后每刻结算
  // CorruptedBeamSpell.CastingSound：CORRUPT_BEAM_START（2 个变体取第 1 个）
  声音: [{ 资产: '音效/诡厄巫法/goety.corrupt_beam_start.1', 秒: 0 }],
});
