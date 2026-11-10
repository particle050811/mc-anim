// 尖刺（goety:shredding_focus → SpikeSpell）的元数据和摆位。出处见 尖刺.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 沿角, 游戏水平角 } from '../零件/地面.ts';

export const 尖刺根数 = 16;
/** 游戏里 Spike.lifeTicks = 600（地刺立 30 秒）；片里缩到 100 刻（自己定的，齐放里一招占不了 30 秒），升起、缩回的动作照游戏 */
export const 尖刺寿命刻 = 100;
export const 尖刺一排 = (起点: 点, 目标: 点): { 位: 点; 朝角: number; warmup: number }[] => {
  const f = 游戏水平角(起点, 目标);
  return Array.from({ length: 尖刺根数 }, (_, l) => {
    const [dx, dy] = 沿角(f, 1.25 * (l + 1));
    return { 位: [起点[0] + dx, 起点[1] + dy, 目标[2]] as const, 朝角: f, warmup: l };
  });
};

// 地刺出土那一刻起每刻都伤碰到的人：命中 = 离目标最近那根出土
const 时长 = (起点: 点, 目标: 点) => {
  const 距 = Math.hypot(目标[0] - 起点[0], 目标[1] - 起点[1]);
  const l = Math.min(尖刺根数 - 1, Math.max(0, Math.round(距 / 1.25) - 1));
  return { 长秒: (尖刺根数 + 1 + 尖刺寿命刻) / 20, 命中秒: (l + 1) / 20 };
};

export default 定义法术元({
  id: 'shredding',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // SpikeSpell：playSound(EVOKER_CAST_SPELL, 1, 0.5)；每根出土 GRINDSTONE_USE（音高 0.85～1.05）
  声音: [
    { 资产: '音效/entity.evoker.cast_spell.1', 秒: 0, 音高: 0.5 },
    ...Array.from({ length: 尖刺根数 }, (_, l) => ({ 资产: '音效/block.grindstone.use.1', 秒: (l + 1) / 20, 音高: 0.95 })),
  ],
});
