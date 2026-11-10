// 甲组（弹道、飞行物）的演出表。每做完一个法术在这里加一行，甲.元.ts 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.tsx'; 再放进数组。
import type { 法术演出条 } from '../定义.tsx';
import magic_bolt from '../法术/magic_bolt.tsx';
import sword from '../法术/sword.tsx';
import ice_spike from '../法术/ice_spike.tsx';
import poison_dart from '../法术/poison_dart.tsx';
import razor_wind from '../法术/razor_wind.tsx';
import bouncy_bubble from '../法术/bouncy_bubble.tsx';
import smack_stone from '../法术/smack_stone.tsx';
import fireball from '../法术/fireball.tsx';
import lavaball from '../法术/lavaball.tsx';
import bombardment from '../法术/bombardment.tsx';
import wither_skull from '../法术/wither_skull.tsx';
import steaming from '../法术/steaming.tsx';
import surging from '../法术/surging.tsx';
import electrocute from '../法术/electrocute.tsx';

export const 甲演出: readonly 法术演出条[] = [magic_bolt, sword, ice_spike, poison_dart, razor_wind, bouncy_bubble, smack_stone, fireball, lavaball, bombardment, wither_skull, steaming, surging, electrocute];
