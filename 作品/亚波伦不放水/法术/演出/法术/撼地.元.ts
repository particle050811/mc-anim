// 撼地（goety:earth_punch_focus → EarthFistSpell）的元数据。出处见 撼地.tsx。
import { defineSpellMeta } from '../接口.ts';

/** warmup 10 刻（地面冒碎屑），下一刻拳头破土；破土后 lifeTicks 30 刻开始缩回，再 8 刻消失 */
export const fistEmergeTick = 11;
export const fistRetractTick = fistEmergeTick + 30;
export const fistVanishTick = fistRetractTick + 8;

export default defineSpellMeta({
  id: 'earth_punch',
  长秒: (fistVanishTick + 20) / 20,
  hitSec: fistEmergeTick / 20,
  // EarthFistSpell：目标处 RUMBLE；破土时 WALL_ERUPT（音高 0.85～1.05）
  sound: [
    { asset: '音效/诡厄巫法/goety.rumble.1', sec: 0 },
    { asset: '音效/诡厄巫法/goety.wall_erupt.1', sec: fistEmergeTick / 20, 音高: 0.95 },
  ],
});
