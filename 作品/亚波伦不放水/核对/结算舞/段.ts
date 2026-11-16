// 结算舞核对：娘化亚波伦跳「忘情牛肉面」（作品/亚波伦不放水/角色/动作/忘情牛肉面.ts）。0～10 秒纯色底、正面全身竖构图（和参考视频 08 同构图），
// 10～20 秒同一支舞放到粉色教堂的跳舞位。段内第 n 秒 = 舞的第 n 秒（后半减 10），静帧每 30 帧一张就是每 0.5 秒一张。没有配乐。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect, halfSec } from './视图.ts';

export default checkSeg({ sec: halfSec * 2, aspect });
