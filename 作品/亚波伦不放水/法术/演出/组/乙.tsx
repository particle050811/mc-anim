// 乙组（地面上长出来的实体模型）的演出表。每做完一个法术在这里加一行，乙.元.ts 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.tsx'; 再放进数组。
import type { SpellPerformanceEntry } from '../定义.tsx';

import Bite from '../法术/撕咬.tsx';
import FangFeast from '../法术/尖牙盛宴.tsx';
import FangAttack from '../法术/牙之.tsx';
import Spikes from '../法术/尖刺.tsx';
import obstacle from '../法术/障碍.tsx';
import EarthShake from '../法术/撼地.tsx';
import Glacier from '../法术/冰川.tsx';
import Eruption from '../法术/喷发.tsx';
import entangle from '../法术/缠绕.tsx';
import overgrowth from '../法术/过度生长.tsx';
import scatter from '../法术/散射.tsx';
import bioMine from '../法术/生物地雷.tsx';
import TridentStorm from '../法术/三叉戟风暴.tsx';
import waterWhip from '../法术/水鞭.tsx';
import GroundQuake from '../法术/震地.tsx';

export const groupBPerformance: readonly SpellPerformanceEntry[] = [
  Bite,
  FangFeast,
  FangAttack,
  Spikes,
  obstacle,
  EarthShake,
  Glacier,
  Eruption,
  entangle,
  overgrowth,
  scatter,
  bioMine,
  TridentStorm,
  waterWhip,
  GroundQuake,
];
