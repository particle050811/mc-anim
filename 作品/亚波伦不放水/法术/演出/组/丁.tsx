// 丁组（环、爆、云、区域粒子）的演出表。每做完一个法术在这里加一行，丁.元.ts 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.tsx'; 再放进数组。
import type { SpellPerformanceEntry } from '../定义.tsx';
import ShockWave from '../法术/冲击波.tsx';
import weaken from '../法术/弱化.tsx';
import FrostNova from '../法术/霜冻新星.tsx';
import Shudder from '../法术/战栗.tsx';
import temblorClap from '../法术/震颤猛击.tsx';
import FlameBurst from '../法术/炎爆.tsx';
import Whirlwind from '../法术/旋风.tsx';
import Updraft from '../法术/上升气流.tsx';
import dash from '../法术/冲刺.tsx';
import Revelation from '../法术/炼狱.tsx';
import Hail from '../法术/冰雹.tsx';
import Monsoon from '../法术/季风.tsx';
import BlazeRise from '../法术/炽燃升腾.tsx';
import Thunderstorm from '../法术/雷暴.tsx';
import Tear from '../法术/撕裂.tsx';
import AbsoluteZero from '../法术/绝对零度.tsx';

export const groupDPerformance: readonly SpellPerformanceEntry[] = [ShockWave, weaken, FrostNova, Shudder, temblorClap, FlameBurst, Whirlwind, Updraft, dash, Revelation, Hail, Monsoon, BlazeRise, Thunderstorm, Tear, AbsoluteZero];
