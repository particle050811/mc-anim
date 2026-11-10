// 丁组（环、爆、云、区域粒子，名单见 ../分组.ts）的元数据表（纯，段.ts 能引）。每做完一个法术在这里加一行，丁.tsx 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.元.ts'; 再放进数组。
import type { 法术元 } from '../接口.ts';

export const 丁元: readonly 法术元[] = [];
