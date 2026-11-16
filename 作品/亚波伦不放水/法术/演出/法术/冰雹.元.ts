// 冰雹（goety:hail_focus）的元数据。出处见 冰雹.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 云放了多少刻雪：游戏里 lifeSpan 100 刻；片里只放 60 刻（自己定的） */
export const hailSnowTicks = 60;
/** 云出来到开始下雪：activateTime 20 刻 */
export const hailActiveTick = 20;

export default defineSpellMeta({
  id: 'hail',
  长秒: 7, // 云 80 刻 + 最后一批雪尘落到地上、散掉
  hitSec: hailActiveTick / 20, // 激活后每刻对云下的目标结算
  // 施法音 frost_prepare_spell；受伤音 PLAYER_HURT_FREEZE 每次伤害响，这里只放第一次
  sound: [
    { asset: '音效/诡厄巫法/goety.frost_prepare_spell.1', sec: 0 },
    { asset: '音效/entity.player.hurt_freeze.1', sec: hailActiveTick / 20 },
  ],
});
