// 虫群（goety:swarm_focus）的元数据。出处见 虫群.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 游戏里按住多久喷多久；片里喷这么多刻（自己定的） */
export const swarmDurTicks = 50;
/** 一颗粒子活多少刻 */
export const swarmParticleLifeTicks = 8;

export default defineSpellMeta({
  id: 'swarm',
  长秒: (swarmDurTicks + swarmParticleLifeTicks) / 20,
  hitSec: 0, // 每刻对视线前方一段锥形里的生物结算
  // SwarmSpell.SpellResult：每刻响 INSECT_SWARM（2 个变体轮着排），音量、音高都是 随机 × 0.5（这里取 0.25、0.5）
  声音: Array.from({ length: swarmDurTicks }, (_, n) => ({ 资产: `音效/诡厄巫法/goety.insect_swarm.${(n % 2) + 1}`, 秒: n / 20, 音量: 0.25, 音高: 0.5 })),
});
