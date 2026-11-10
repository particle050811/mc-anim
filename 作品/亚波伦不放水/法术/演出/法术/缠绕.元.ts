// 缠绕（goety:entangling_focus → EntanglingSpell）的元数据和时序。出处见 缠绕.tsx。
import { 定义法术元 } from '../接口.ts';

/** TangleEntity：activeTick 第 1 刻破土，到 lifeSpan（80）缩回，再过 20 刻消失 */
export const 藤破土刻 = 1;
export const 藤缩回刻 = 80;
export const 藤消失刻 = 100;

export default 定义法术元({
  id: 'entangling',
  长秒: 藤消失刻 / 20,
  命中秒: 藤破土刻 / 20,
  // EntangleVines.burst：VINE_TRAP_BURST（音量 2）、VINE_TRAP_HOLD
  声音: [
    { 资产: '音效/诡厄巫法/goety.vine_trap_burst.1', 秒: 藤破土刻 / 20, 音量: 2 },
    { 资产: '音效/诡厄巫法/goety.vine_trap_hold', 秒: 藤破土刻 / 20 },
  ],
});
