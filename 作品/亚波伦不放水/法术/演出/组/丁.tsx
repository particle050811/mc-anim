// 丁组（环、爆、云、区域粒子）的演出表。每做完一个法术在这里加一行，丁.元.ts 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.tsx'; 再放进数组。
import type { 法术演出条 } from '../定义.tsx';
import 冲击波 from '../法术/冲击波.tsx';
import 弱化 from '../法术/弱化.tsx';
import 霜冻新星 from '../法术/霜冻新星.tsx';
import 战栗 from '../法术/战栗.tsx';
import 震颤猛击 from '../法术/震颤猛击.tsx';
import 炎爆 from '../法术/炎爆.tsx';
import 旋风 from '../法术/旋风.tsx';
import 上升气流 from '../法术/上升气流.tsx';
import 冲刺 from '../法术/冲刺.tsx';
import 炼狱 from '../法术/炼狱.tsx';

export const 丁演出: readonly 法术演出条[] = [冲击波, 弱化, 霜冻新星, 战栗, 震颤猛击, 炎爆, 旋风, 上升气流, 冲刺, 炼狱];
