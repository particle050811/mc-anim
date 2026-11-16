// 卫射（goety:prisma_beam_focus）的元数据。出处见 卫射.tsx。
import { defineSpellMeta, type SpellOptions, type Vec3 } from '../接口.ts';

/** SpellConfig.PrismaBeamDuration 默认 80 刻：激光照满这么久才结算伤害 */
export const guardChargeUpTicks = 80;
/** 这一发照多少刻：给了 施法刻 照它（晋升之环 4 倍施法速度时 80 → 20），不给照默认 80 */
export const guardLightTick = (options?: SpellOptions) => options?.castTick ?? guardChargeUpTicks;
/** 激光指着目标半身高 */
export const guardLandPoint = (target: Vec3): Vec3 => [target[0], target[1], target[2] + 0.9];

export default defineSpellMeta({
  id: 'prisma_beam',
  // 这个法术的画面全在蓄力的 80 刻里（激光一直照着），照满的那一刻结算伤害、激光消失；所以这里的「出手」是开始照
  长秒: (guardChargeUpTicks + 1) / 20,
  hitSec: guardChargeUpTicks / 20,
  duration: (unusedStart, unusedTarget, options) => ({ 长秒: (guardLightTick(options) + 1) / 20, hitSec: guardLightTick(options) / 20 }),
  // PrismaBeamSpell 没有自己的声音（CastingSound、SpellResult 里都没放）
  sound: [],
});
