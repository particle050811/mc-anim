// 震撼（goety:shocking_focus）的元数据。出处见 震撼.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';

/** 游戏里按住多久放多久（没有上限）；片里放这么多刻（自己定的，段里嫌长就少画） */
export const shakeDurTicks = 55;
/** SLightningPacket 的寿命：每道电弧活 5 刻 */
export const shakeLifeTicks = 5;
/** 打在目标半身高（史蒂夫 1.8 格高） */
export const shockLandPoint = (target: Vec3): Vec3 => [target[0], target[1], target[2] + 0.9];

export default defineSpellMeta({
  id: 'shocking',
  长秒: (shakeDurTicks + shakeLifeTicks) / 20,
  hitSec: 0, // 射线判定，每刻结算一次伤害
  // ShockingSpell：每刻在施法者处响一声 ModSounds.ZAP（6 个变体，游戏随机挑，这里轮着排）
  sound: Array.from({ length: shakeDurTicks }, (_, n) => ({ asset: `音效/诡厄巫法/goety.zap.${(n % 6) + 1}`, sec: n / 20 })),
});
