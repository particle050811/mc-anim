// 丙组（束、电弧、吐息，名单见 ../分组.ts）的元数据表（纯，段.ts 能引）。每做完一个法术在这里加一行，丙.tsx 同一位置也加一行。
// 写法：import 某法术 from '../法术/某法术.元.ts'; 再放进数组。
import type { SpellMeta } from '../接口.ts';
import corruptMeta from '../法术/腐化.元.ts';
import leech from '../法术/水蛭.元.ts';
import waterJetMeta from '../法术/水柱.元.ts';
import guardianRayMeta from '../法术/卫射.元.ts';
import windBlastMeta from '../法术/风爆.元.ts';
import frostBreathMeta from '../法术/霜呼.元.ts';
import flameBreathMeta from '../法术/炎呼.元.ts';
import swarm from '../法术/虫群.元.ts';
import sonicBoomMeta from '../法术/音爆.元.ts';
import lightning from '../法术/闪电.元.ts';
import killingMeta from '../法术/索命.元.ts';
import shockMeta from '../法术/震撼.元.ts';
import releaseSpell from '../法术/释放.元.ts';
import witherAnnihilateMeta from '../法术/凋灵寂灭.元.ts';

export const groupCMeta: readonly SpellMeta[] = [corruptMeta, leech, waterJetMeta, guardianRayMeta, windBlastMeta, frostBreathMeta, flameBreathMeta, swarm, sonicBoomMeta, lightning, killingMeta, shockMeta, releaseSpell, witherAnnihilateMeta];
