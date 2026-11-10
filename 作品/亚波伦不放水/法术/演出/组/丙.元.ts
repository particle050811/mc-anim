// 丙组（束、电弧、吐息，名单见 ../分组.ts）的元数据表（纯，段.ts 能引）。每做完一个法术在这里加一行，丙.tsx 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.元.ts'; 再放进数组。
import type { 法术元 } from '../接口.ts';
import 腐化 from '../法术/腐化.元.ts';
import 水蛭 from '../法术/水蛭.元.ts';
import 水柱 from '../法术/水柱.元.ts';
import 卫射 from '../法术/卫射.元.ts';
import 风爆 from '../法术/风爆.元.ts';
import 霜呼 from '../法术/霜呼.元.ts';
import 炎呼 from '../法术/炎呼.元.ts';
import 虫群 from '../法术/虫群.元.ts';
import 音爆 from '../法术/音爆.元.ts';
import 闪电 from '../法术/闪电.元.ts';
import 索命 from '../法术/索命.元.ts';
import 震撼 from '../法术/震撼.元.ts';

export const 丙元: readonly 法术元[] = [腐化, 水蛭, 水柱, 卫射, 风爆, 霜呼, 炎呼, 虫群, 音爆, 闪电, 索命, 震撼];
