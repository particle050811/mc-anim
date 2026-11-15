// 生物地雷（goety:biomine_focus → BioMineSpell）的元数据。出处见 生物地雷.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 4 颗；lifeTicks 5 秒走完后每刻 1/8 的机会自己炸（放下 20 刻后有敌人进 3 格也炸，片里摆位都在 4 格外） */
export const bioMineCount = 4;
export const bioMineLifeTicks = 100;
/** 自己炸的时刻最晚算到寿命后 24 刻（1/8 的机会连续 24 刻都不中的可能只有 4%，到这一刻还没炸的就在这一刻炸） */
export const bioMineLatestTick = bioMineLifeTicks + 24;
/** 酸池留 3 秒 */
export const acidPoolTicks = 60;

export default defineSpellMeta({
  id: 'biomine',
  长秒: (bioMineLatestTick + acidPoolTicks + 10) / 20,
  // BioMineSpell：每颗一声 BIOMINE_SPAWN；BioMine.trigger：BIOMINE_TRIGGER（音量 1.4），各颗时刻随种子变，这里记在寿命到的那一刻
  声音: [
    ...[1, 2, 3, 1].map((n) => ({ 资产: `音效/诡厄巫法/goety.biomine_spawn.${n}`, 秒: 0 })),
    { 资产: '音效/诡厄巫法/goety.biomine_trigger.1', 秒: bioMineLifeTicks / 20, 音量: 1.4 },
  ],
});
