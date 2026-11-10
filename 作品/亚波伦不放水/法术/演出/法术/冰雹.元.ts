// 冰雹（goety:hail_focus）的元数据。出处见 冰雹.tsx。
import { 定义法术元 } from '../接口.ts';

/** 云放了多少刻雪：游戏里 lifeSpan 100 刻；片里只放 60 刻（自己定的） */
export const 冰雹下雪刻 = 60;
/** 云出来到开始下雪：activateTime 20 刻 */
export const 冰雹激活刻 = 20;

export default 定义法术元({
  id: 'hail',
  长秒: 7, // 云 80 刻 + 最后一批雪尘落到地上、散掉
  命中秒: 冰雹激活刻 / 20, // 激活后每刻对云下的目标结算
  // 施法音 frost_prepare_spell；受伤音 PLAYER_HURT_FREEZE 每次伤害响，这里只放第一次
  声音: [
    { 资产: '音效/诡厄巫法/goety.frost_prepare_spell.1', 秒: 0 },
    { 资产: '音效/entity.player.hurt_freeze.1', 秒: 冰雹激活刻 / 20 },
  ],
});
