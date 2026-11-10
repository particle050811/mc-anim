// 乙组（地面上长出来的实体模型，名单见 ../分组.ts）的元数据表（纯，段.ts 能引）。每做完一个法术在这里加一行，乙.tsx 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.元.ts'; 再放进数组。
import type { 法术元 } from '../接口.ts';

import 撕咬 from '../法术/撕咬.元.ts';
import 尖牙盛宴 from '../法术/尖牙盛宴.元.ts';
import 牙之 from '../法术/牙之.元.ts';
import 尖刺 from '../法术/尖刺.元.ts';
import 障碍 from '../法术/障碍.元.ts';
import 撼地 from '../法术/撼地.元.ts';
import 冰川 from '../法术/冰川.元.ts';
import 喷发 from '../法术/喷发.元.ts';
import 缠绕 from '../法术/缠绕.元.ts';
import 过度生长 from '../法术/过度生长.元.ts';
import 散射 from '../法术/散射.元.ts';
import 生物地雷 from '../法术/生物地雷.元.ts';

export const 乙元: readonly 法术元[] = [
  撕咬,
  尖牙盛宴,
  牙之,
  尖刺,
  障碍,
  撼地,
  冰川,
  喷发,
  缠绕,
  过度生长,
  散射,
  生物地雷,
];
