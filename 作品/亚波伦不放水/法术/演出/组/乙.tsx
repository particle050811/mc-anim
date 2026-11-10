// 乙组（地面上长出来的实体模型）的演出表。每做完一个法术在这里加一行，乙.ts 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.tsx'; 再放进数组。
import type { 法术演出条 } from '../定义.tsx';

export const 乙演出: readonly 法术演出条[] = [];
