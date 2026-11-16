// 旋风（goety:whirlwind_focus）的元数据。出处见 旋风.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 游戏里按住多久放多久（WhirlwindDuration 配置没查到默认值）；片里放这么多刻（自己定的） */
export const whirlwindDurTicks = 40;
/** WindParticle 没给寿命时最长 39 刻 */
export const whirlwindBandMaxTicks = 39;

export default defineSpellMeta({
  id: 'whirlwind',
  长秒: (whirlwindDurTicks + whirlwindBandMaxTicks) / 20,
  hitSec: 0,
  // 施法音 wind，持续音 whirlwind
  sound: [
    { asset: '音效/诡厄巫法/goety.wind.1', sec: 0 },
    { asset: '音效/诡厄巫法/goety.whirlwind', sec: 0 },
  ],
});
