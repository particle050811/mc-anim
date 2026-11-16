// 水蛭（goety:leeching_focus）的元数据。出处见 水蛭.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 游戏里按住多久放多久；片里吸这么多刻（自己定的） */
export const leechDurTicks = 50;

export default defineSpellMeta({
  id: 'leeching',
  长秒: (leechDurTicks + 10) / 20, // 最后一刻出的粒子再活 10 刻
  hitSec: 0,
  // LeechingSpell：伤害打进去时响 SOUL_EAT（3 个变体）；生物受伤后有 10 刻无敌，所以每 10 刻响一声
  sound: Array.from({ length: leechDurTicks / 10 }, (_, n) => ({ asset: `音效/诡厄巫法/goety.soul_eat.${(n % 3) + 1}`, sec: n / 2 })),
});
