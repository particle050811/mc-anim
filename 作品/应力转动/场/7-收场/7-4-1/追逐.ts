// 7-4-1 风筝的兜圈：马、监守者各在自己那一圈（几何.ts）上逆时针匀速跑，剧情时刻 T（秒），T = 0 马在西北角。
// 用户 10-18 定：马 50、监守者 60 米/秒。两圈长度比正好是 60 : 50，所以每圈到起跳点时它都差不多落后同样的距离（`takeoffGap`），一圈只追近 0.6 米。
// 它死了以后马跑完手上这一跳：落上岛南头台面就勒马，按默认的 `RAMP_SEC` 刹住，停在台面东头起跳点前。
import { RAMP_SEC } from '@库/角色/跑步.ts';
import { baseSpeed } from '../../../地点/古城4x/布局.ts';
import * as geom from './几何.ts';

export const horseSpeed = baseSpeed.马;
export const wardenSpeed = baseSpeed.监守者;
// 第一圈马起跳那一刻它在马身后多少米（顺着西环道）；之后每圈少 0.6 米，第五圈还剩 10 米上下
export const takeoffGap = 12;
const firstTakeoffT = geom.horseMarks.起跳 / horseSpeed;
const wardenS0 = geom.horseMarks.起跳 - takeoffGap - wardenSpeed * firstTakeoffT;

// 马第 n 圈（0 起）各拐点的程（没绕圈展开，程一直往上加）
export const horseLapS = (n: number, mark: keyof typeof geom.horseMarks) => n * geom.horseLoop.len + geom.horseMarks[mark];
export const wardenLapS = (n: number, s: number) => n * geom.wardenLoop.len + s;

// 勒马：`stopAfterT` 以后第一次落上台面（上台）开始刹，刹 brakeSec 秒停住
export const brakeSec = RAMP_SEC;
export type Chase = { horseS: (T: number) => number; horseV: (T: number) => number; brakeT: number; stopT: number; stopS: number };
export const simulate = (stopAfterT = Infinity): Chase => {
  let brakeT = Infinity;
  if (stopAfterT < Infinity) {
    const s = horseSpeed * stopAfterT;
    const lap = Math.floor((s - geom.horseMarks.上台) / geom.horseLoop.len) + 1;
    brakeT = horseLapS(lap, '上台') / horseSpeed;
  }
  const stopT = brakeT + brakeSec;
  const stopS = horseSpeed * brakeT + (horseSpeed * brakeSec) / 2;
  const horseV = (T: number) => (T < brakeT ? horseSpeed : T < stopT ? horseSpeed * (1 - (T - brakeT) / brakeSec) : 0);
  const horseS = (T: number) => {
    if (T < brakeT) return horseSpeed * T;
    const t = Math.min(T, stopT) - brakeT;
    return horseSpeed * brakeT + horseSpeed * t - (horseSpeed * t * t) / (2 * brakeSec);
  };
  return { horseS, horseV, brakeT, stopT, stopS };
};
export const wardenS = (T: number) => wardenS0 + wardenSpeed * T;
// 马第 n 圈起跳那一刻（没勒马的跑法）
export const takeoffT = (n: number) => horseLapS(n, '起跳') / horseSpeed;
// 它在自己那一圈上走到程 s（展开的）是哪一刻
export const wardenTAt = (s: number) => (s - wardenS0) / wardenSpeed;
