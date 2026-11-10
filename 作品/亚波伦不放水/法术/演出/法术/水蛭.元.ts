// 水蛭（goety:leeching_focus）的元数据。出处见 水蛭.tsx。
import { 定义法术元 } from '../接口.ts';

/** 游戏里按住多久放多久；片里吸这么多刻（自己定的） */
export const 水蛭持续刻 = 50;

export default 定义法术元({
  id: 'leeching',
  长秒: (水蛭持续刻 + 10) / 20, // 最后一刻出的粒子再活 10 刻
  命中秒: 0,
  // LeechingSpell：伤害打进去时响 SOUL_EAT（3 个变体）；生物受伤后有 10 刻无敌，所以每 10 刻响一声
  声音: Array.from({ length: 水蛭持续刻 / 10 }, (_, n) => ({ 资产: `音效/诡厄巫法/goety.soul_eat.${(n % 3) + 1}`, 秒: n / 2 })),
});
