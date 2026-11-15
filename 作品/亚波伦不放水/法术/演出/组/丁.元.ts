// 丁组（环、爆、云、区域粒子，名单见 ../分组.ts）的元数据表（纯，段.ts 能引）。每做完一个法术在这里加一行，丁.tsx 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.元.ts'; 再放进数组。
import type { SpellMeta } from '../接口.ts';
import shockWaveMeta from '../法术/冲击波.元.ts';
import weakenMeta from '../法术/弱化.元.ts';
import frostNovaMeta from '../法术/霜冻新星.元.ts';
import shudderMeta from '../法术/战栗.元.ts';
import temblorClapMeta from '../法术/震颤猛击.元.ts';
import flameBurstMeta from '../法术/炎爆.元.ts';
import whirlwindMeta from '../法术/旋风.元.ts';
import updraftMeta from '../法术/上升气流.元.ts';
import dashMeta from '../法术/冲刺.元.ts';
import revelationMeta from '../法术/炼狱.元.ts';
import hailMeta from '../法术/冰雹.元.ts';
import monsoonMeta from '../法术/季风.元.ts';
import blazeRiseMeta from '../法术/炽燃升腾.元.ts';
import thunderstormMeta from '../法术/雷暴.元.ts';
import tearMeta from '../法术/撕裂.元.ts';
import absoluteZeroMeta from '../法术/绝对零度.元.ts';

export const groupDMeta: readonly SpellMeta[] = [shockWaveMeta, weakenMeta, frostNovaMeta, shudderMeta, temblorClapMeta, flameBurstMeta, whirlwindMeta, updraftMeta, dashMeta, revelationMeta, hailMeta, monsoonMeta, blazeRiseMeta, thunderstormMeta, tearMeta, absoluteZeroMeta];
