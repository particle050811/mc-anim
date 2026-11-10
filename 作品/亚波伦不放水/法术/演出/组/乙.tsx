// 乙组（地面上长出来的实体模型）的演出表。每做完一个法术在这里加一行，乙.元.ts 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.tsx'; 再放进数组。
import type { 法术演出条 } from '../定义.tsx';

import 撕咬 from '../法术/撕咬.tsx';
import 尖牙盛宴 from '../法术/尖牙盛宴.tsx';
import 牙之 from '../法术/牙之.tsx';
import 尖刺 from '../法术/尖刺.tsx';
import 障碍 from '../法术/障碍.tsx';
import 撼地 from '../法术/撼地.tsx';
import 冰川 from '../法术/冰川.tsx';
import 喷发 from '../法术/喷发.tsx';
import 缠绕 from '../法术/缠绕.tsx';
import 过度生长 from '../法术/过度生长.tsx';

export const 乙演出: readonly 法术演出条[] = [
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
];
