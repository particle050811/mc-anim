// 乙组（地面上长出来的实体模型，名单见 ../分组.ts）的元数据表（纯，段.ts 能引）。每做完一个法术在这里加一行，乙.tsx 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.元.ts'; 再放进数组。
import type { SpellMeta } from '../接口.ts';

import biteMeta from '../法术/撕咬.元.ts';
import fangFeastMeta from '../法术/尖牙盛宴.元.ts';
import fangAttackMeta from '../法术/牙之.元.ts';
import spikesMeta from '../法术/尖刺.元.ts';
import obstacle from '../法术/障碍.元.ts';
import earthShakeMeta from '../法术/撼地.元.ts';
import glacierMeta from '../法术/冰川.元.ts';
import eruptionMeta from '../法术/喷发.元.ts';
import entangle from '../法术/缠绕.元.ts';
import overgrowth from '../法术/过度生长.元.ts';
import scatter from '../法术/散射.元.ts';
import bioMine from '../法术/生物地雷.元.ts';
import tridentStormMeta from '../法术/三叉戟风暴.元.ts';
import waterWhip from '../法术/水鞭.元.ts';
import groundQuakeMeta from '../法术/震地.元.ts';

export const groupBMeta: readonly SpellMeta[] = [
  biteMeta,
  fangFeastMeta,
  fangAttackMeta,
  spikesMeta,
  obstacle,
  earthShakeMeta,
  glacierMeta,
  eruptionMeta,
  entangle,
  overgrowth,
  scatter,
  bioMine,
  tridentStormMeta,
  waterWhip,
  groundQuakeMeta,
];
