// 缠绕（goety:entangling_focus → EntanglingSpell）的元数据和时序。出处见 缠绕.tsx。
import { defineSpellMeta } from '../接口.ts';

/** TangleEntity：activeTick 第 1 刻破土，到 lifeSpan（80）缩回，再过 20 刻消失 */
export const vineEmergeTick = 1;
export const vineRetractTick = 80;
export const vineVanishTick = 100;

export default defineSpellMeta({
  id: 'entangling',
  长秒: vineVanishTick / 20,
  hitSec: vineEmergeTick / 20,
  // EntangleVines.burst：VINE_TRAP_BURST（音量 2）、VINE_TRAP_HOLD
  sound: [
    { asset: '音效/诡厄巫法/goety.vine_trap_burst.1', sec: vineEmergeTick / 20, 音量: 2 },
    { asset: '音效/诡厄巫法/goety.vine_trap_hold', sec: vineEmergeTick / 20 },
  ],
});
