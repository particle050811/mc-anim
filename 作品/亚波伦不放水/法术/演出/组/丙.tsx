// 丙组（束、电弧、吐息）的演出表。每做完一个法术在这里加一行，丙.元.ts 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.tsx'; 再放进数组。
import type { SpellPerformanceEntry } from '../定义.tsx';
import Corrupt from '../法术/腐化.tsx';
import leech from '../法术/水蛭.tsx';
import WaterJet from '../法术/水柱.tsx';
import GuardianRay from '../法术/卫射.tsx';
import WindBlast from '../法术/风爆.tsx';
import FrostBreath from '../法术/霜呼.tsx';
import FlameBreath from '../法术/炎呼.tsx';
import swarm from '../法术/虫群.tsx';
import sonicBoomSpell from '../法术/音爆.tsx';
import lightning from '../法术/闪电.tsx';
import Killing from '../法术/索命.tsx';
import Shock from '../法术/震撼.tsx';
import ReleaseSpell from '../法术/释放.tsx';
import WitherAnnihilate from '../法术/凋灵寂灭.tsx';

export const groupCPerformance: readonly SpellPerformanceEntry[] = [Corrupt, leech, WaterJet, GuardianRay, WindBlast, FrostBreath, FlameBreath, swarm, sonicBoomSpell, lightning, Killing, Shock, ReleaseSpell, WitherAnnihilate];
