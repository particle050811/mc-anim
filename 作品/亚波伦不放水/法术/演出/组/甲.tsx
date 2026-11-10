// 甲组（弹道、飞行物）的演出表。每做完一个法术在这里加一行，甲.元.ts 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.tsx'; 再放进数组。
import type { 法术演出条 } from '../定义.tsx';
import fireball from '../法术/fireball.tsx';
import lavaball from '../法术/lavaball.tsx';
import bombardment from '../法术/bombardment.tsx';
import wither_skull from '../法术/wither_skull.tsx';

export const 甲演出: readonly 法术演出条[] = [fireball, lavaball, bombardment, wither_skull];
