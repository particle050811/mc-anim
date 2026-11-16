// 炽燃升腾（goety:flame_strike_focus）的元数据。出处见 炽燃升腾.tsx。
import { defineSpellMeta } from '../接口.ts';

/** FlameStrikeSpell：warmUp = 蓄力刻 60 − 10 */
export const blazeWarmupTick = 50;
/** 预热完后火柱放多久：游戏里 duration 180 刻；片里只放 60 刻（自己定的） */
export const blazeEruptTick = 60;

export default defineSpellMeta({
  id: 'flame_strike',
  长秒: (blazeWarmupTick + blazeEruptTick + 30) / 20, // 最后一颗火柱粒子寿命最长 29 刻
  hitSec: blazeWarmupTick / 20, // 预热完才开始伤人
  // 施法音 rumble；FirePillar 预热完 fire_breath_start 音量 0.05，之后每 20 刻 fire_tornado_ambient（每根都响，这里按一根算）
  sound: [
    { asset: '音效/诡厄巫法/goety.rumble.1', sec: 0 },
    { asset: '音效/诡厄巫法/goety.fire_breath_start', sec: blazeWarmupTick / 20, 音量: 0.05 },
    ...[0, 20, 40].map((tick) => ({ asset: '音效/诡厄巫法/goety.fire_tornado_ambient', sec: (blazeWarmupTick + tick) / 20 })),
  ],
});
