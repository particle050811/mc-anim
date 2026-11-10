// 震撼（goety:shocking_focus）的元数据。出处见 震撼.tsx。
import { 定义法术元, type 点 } from '../接口.ts';

/** 游戏里按住多久放多久（没有上限）；片里放这么多刻（自己定的，段里嫌长就少画） */
export const 震撼持续刻 = 55;
/** SLightningPacket 的寿命：每道电弧活 5 刻 */
export const 震撼寿命刻 = 5;
/** 打在目标半身高（史蒂夫 1.8 格高） */
export const 震撼落点 = (目标: 点): 点 => [目标[0], 目标[1], 目标[2] + 0.9];

export default 定义法术元({
  id: 'shocking',
  长秒: (震撼持续刻 + 震撼寿命刻) / 20,
  命中秒: 0, // 射线判定，每刻结算一次伤害
  // ShockingSpell：每刻在施法者处响一声 ModSounds.ZAP（6 个变体，游戏随机挑，这里轮着排）
  声音: Array.from({ length: 震撼持续刻 }, (_, n) => ({ 资产: `音效/诡厄巫法/goety.zap.${(n % 6) + 1}`, 秒: n / 20 })),
});
