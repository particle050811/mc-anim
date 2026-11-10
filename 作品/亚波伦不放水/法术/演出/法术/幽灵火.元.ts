// 幽灵火（goety:ghost_fire_focus）的元数据。出处见 幽灵火.tsx。
import { 定义法术元 } from '../接口.ts';

/** IceBouquet 的 lifeTicks：服务端 100 刻后移除 */
export const 幽灵火寿命刻 = 100;

export default 定义法术元({
  id: 'ghost_fire',
  长秒: 幽灵火寿命刻 / 20,
  命中秒: 12 / 20, // IceBouquet.tick：tickCount ≥ 12 起每刻对碰撞箱里的生物结算伤害
  // IceBouquetSpell：SoundUtil.playNecromancerSummon（音量 1.4、音高 0.7）；中心那丛出生时 WRAITH_FIRE，其余三丛第 12 刻各响 REDSTONE_FIRE_PROJECTILE、FIRE_PROJECTILE_FLY（音量 0.3、音高 1.3，这里各记一声）
  声音: [
    { 资产: '音效/诡厄巫法/goety.necromancer_summon.1', 秒: 0, 音量: 1.4, 音高: 0.7 },
    { 资产: '音效/诡厄巫法/goety.wraith_fire', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.redstone_fire_projectile', 秒: 0.6, 音量: 0.3, 音高: 1.3 },
    { 资产: '音效/诡厄巫法/goety.fire_projectile_fly.1', 秒: 0.6, 音量: 0.3, 音高: 1.3 },
  ],
});
