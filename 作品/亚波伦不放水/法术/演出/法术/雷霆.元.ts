// 雷霆（goety:thunderbolt_focus）的元数据。出处见 雷霆.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';

/** SThunderBoltPacket 的寿命：电弧活 10 刻 */
export const thunderLifeTicks = 10;
/** 电弧打在目标半身高：ThunderboltSpell 取 目标位置 + 身高 ÷ 2（史蒂夫 1.8 格高） */
export const boltLandPoint = (target: Vec3): Vec3 => [target[0], target[1], target[2] + 0.9];

export default defineSpellMeta({
  id: 'thunderbolt',
  长秒: thunderLifeTicks / 20,
  hitSec: 0, // 射线判定，放出来当刻就结算伤害
  // ThunderboltSpell：施法者处 ModSounds.THUNDERBOLT（3 个变体取第 1 个）
  sound: [{ asset: '音效/诡厄巫法/goety.thunderbolt.1', sec: 0 }],
});
