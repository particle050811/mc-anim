// 丁组（环、爆、云、区域粒子）的演出表。每做完一个法术在这里加一行，丁.ts 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.tsx'; 再放进数组。
import type { 法术演出条 } from '../定义.tsx';

export const 丁演出: readonly 法术演出条[] = [];
