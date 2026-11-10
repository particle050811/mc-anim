// 甲组（弹道、飞行物，名单见 ../分组.ts）的元数据表（纯，段.ts 能引）。每做完一个法术在这里加一行，甲.tsx 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.元.ts'; 再放进数组。
import type { 法术元 } from '../接口.ts';
import fireball from '../法术/fireball.元.ts';
import lavaball from '../法术/lavaball.元.ts';
import bombardment from '../法术/bombardment.元.ts';
import wither_skull from '../法术/wither_skull.元.ts';

export const 甲元: readonly 法术元[] = [fireball, lavaball, bombardment, wither_skull];
