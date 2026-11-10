// 丁组（环、爆、云、区域粒子，名单见 ../分组.ts）的元数据表（纯，段.ts 能引）。每做完一个法术在这里加一行，丁.tsx 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.元.ts'; 再放进数组。
import type { 法术元 } from '../接口.ts';
import 冲击波元 from '../法术/冲击波.元.ts';
import 弱化元 from '../法术/弱化.元.ts';
import 霜冻新星元 from '../法术/霜冻新星.元.ts';
import 战栗元 from '../法术/战栗.元.ts';
import 震颤猛击元 from '../法术/震颤猛击.元.ts';
import 炎爆元 from '../法术/炎爆.元.ts';
import 旋风元 from '../法术/旋风.元.ts';
import 上升气流元 from '../法术/上升气流.元.ts';
import 冲刺元 from '../法术/冲刺.元.ts';
import 炼狱元 from '../法术/炼狱.元.ts';
import 冰雹元 from '../法术/冰雹.元.ts';
import 季风元 from '../法术/季风.元.ts';
import 炽燃升腾元 from '../法术/炽燃升腾.元.ts';
import 雷暴元 from '../法术/雷暴.元.ts';
import 撕裂元 from '../法术/撕裂.元.ts';
import 绝对零度元 from '../法术/绝对零度.元.ts';

export const 丁元: readonly 法术元[] = [冲击波元, 弱化元, 霜冻新星元, 战栗元, 震颤猛击元, 炎爆元, 旋风元, 上升气流元, 冲刺元, 炼狱元, 冰雹元, 季风元, 炽燃升腾元, 雷暴元, 撕裂元, 绝对零度元];
