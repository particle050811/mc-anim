// 丙组（束、电弧、吐息）的演出表。每做完一个法术在这里加一行，丙.元.ts 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.tsx'; 再放进数组。
import type { 法术演出条 } from '../定义.tsx';
import 腐化 from '../法术/腐化.tsx';
import 水柱 from '../法术/水柱.tsx';
import 卫射 from '../法术/卫射.tsx';
import 音爆 from '../法术/音爆.tsx';
import 闪电 from '../法术/闪电.tsx';
import 索命 from '../法术/索命.tsx';
import 震撼 from '../法术/震撼.tsx';

export const 丙演出: readonly 法术演出条[] = [腐化, 水柱, 卫射, 音爆, 闪电, 索命, 震撼];
