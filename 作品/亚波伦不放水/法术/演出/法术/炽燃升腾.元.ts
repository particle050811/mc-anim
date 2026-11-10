// 炽燃升腾（goety:flame_strike_focus）的元数据。出处见 炽燃升腾.tsx。
import { 定义法术元 } from '../接口.ts';

/** FlameStrikeSpell：warmUp = 蓄力刻 60 − 10 */
export const 炽燃预热刻 = 50;
/** 预热完后火柱放多久：游戏里 duration 180 刻；片里只放 60 刻（自己定的） */
export const 炽燃喷发刻 = 60;

export default 定义法术元({
  id: 'flame_strike',
  长秒: (炽燃预热刻 + 炽燃喷发刻 + 30) / 20, // 最后一颗火柱粒子寿命最长 29 刻
  命中秒: 炽燃预热刻 / 20, // 预热完才开始伤人
  // 施法音 rumble；FirePillar 预热完 fire_breath_start 音量 0.05，之后每 20 刻 fire_tornado_ambient（每根都响，这里按一根算）
  声音: [
    { 资产: '音效/诡厄巫法/goety.rumble.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.fire_breath_start', 秒: 炽燃预热刻 / 20, 音量: 0.05 },
    ...[0, 20, 40].map((刻) => ({ 资产: '音效/诡厄巫法/goety.fire_tornado_ambient', 秒: (炽燃预热刻 + 刻) / 20 })),
  ],
});
