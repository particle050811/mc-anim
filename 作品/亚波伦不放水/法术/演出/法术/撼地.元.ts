// 撼地（goety:earth_punch_focus → EarthFistSpell）的元数据。出处见 撼地.tsx。
import { 定义法术元 } from '../接口.ts';

/** warmup 10 刻（地面冒碎屑），下一刻拳头破土；破土后 lifeTicks 30 刻开始缩回，再 8 刻消失 */
export const 拳破土刻 = 11;
export const 拳缩回刻 = 拳破土刻 + 30;
export const 拳消失刻 = 拳缩回刻 + 8;

export default 定义法术元({
  id: 'earth_punch',
  长秒: (拳消失刻 + 20) / 20,
  命中秒: 拳破土刻 / 20,
  // EarthFistSpell：目标处 RUMBLE；破土时 WALL_ERUPT（音高 0.85～1.05）
  声音: [
    { 资产: '音效/诡厄巫法/goety.rumble.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.wall_erupt.1', 秒: 拳破土刻 / 20, 音高: 0.95 },
  ],
});
