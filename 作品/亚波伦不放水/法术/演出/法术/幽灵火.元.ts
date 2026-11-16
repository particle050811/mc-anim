// 幽灵火（goety:ghost_fire_focus）的元数据。出处见 幽灵火.tsx。
import { defineSpellMeta } from '../接口.ts';

/** IceBouquet 的 lifeTicks：服务端 100 刻后移除 */
export const ghostFireLifeTicks = 100;

export default defineSpellMeta({
  id: 'ghost_fire',
  // 火在第 98 刻缩没，烟冒到实体移除（第 100 刻），一颗最长活 19 刻
  长秒: (ghostFireLifeTicks + 20) / 20,
  hitSec: 12 / 20, // IceBouquet.tick：tickCount ≥ 12 起每刻对碰撞箱里的生物结算伤害
  // IceBouquetSpell：SoundUtil.playNecromancerSummon（音量 1.4、音高 0.7）；中心那丛出生时 WRAITH_FIRE，其余三丛第 12 刻各响 REDSTONE_FIRE_PROJECTILE、FIRE_PROJECTILE_FLY（音量 0.3、音高 1.3，这里各记一声）
  sound: [
    { asset: '音效/诡厄巫法/goety.necromancer_summon.1', sec: 0, 音量: 1.4, 音高: 0.7 },
    { asset: '音效/诡厄巫法/goety.wraith_fire', sec: 0 },
    { asset: '音效/诡厄巫法/goety.redstone_fire_projectile', sec: 0.6, 音量: 0.3, 音高: 1.3 },
    { asset: '音效/诡厄巫法/goety.fire_projectile_fly.1', sec: 0.6, 音量: 0.3, 音高: 1.3 },
  ],
});
