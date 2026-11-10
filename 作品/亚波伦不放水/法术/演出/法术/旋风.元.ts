// 旋风（goety:whirlwind_focus）的元数据。出处见 旋风.tsx。
import { 定义法术元 } from '../接口.ts';

/** 游戏里按住多久放多久（WhirlwindDuration 配置没查到默认值）；片里放这么多刻（自己定的） */
export const 旋风持续刻 = 40;
/** WindParticle 没给寿命时最长 39 刻 */
export const 旋风带最长刻 = 39;

export default 定义法术元({
  id: 'whirlwind',
  长秒: (旋风持续刻 + 旋风带最长刻) / 20,
  命中秒: 0,
  // 施法音 wind，持续音 whirlwind
  声音: [
    { 资产: '音效/诡厄巫法/goety.wind.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.whirlwind', 秒: 0 },
  ],
});
