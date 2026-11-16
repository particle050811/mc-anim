// 全局秒 → 里程（起步、巡航、收势减速、悬停），段表和卡点。
// 这里的段是旧段号的窗口（编排、声音按它分），成片的段界（拼成哪几个 Composition）见 ../../6-2至6-3段界/段表.ts。
import { headingPitch, anchoredOdometer } from '@engine/flight/飞行路径.ts';
import { cruiseSpeed, turnPoint, ROUTE, brakeS } from './航线.ts';
import { smoothstep01 } from '@engine/core/数学.ts';
import { segFps } from '@engine/段/段定义.ts';

// ---------- 时间线（全局秒） ----------
// 里程：前 29/12 秒（33.1 从几乎停着往前冲出去，前 2/3 秒草束离开镜头，17/12 秒前后到巡航速度），之后每秒一公里，从 `decelStartSec` 起一路减速，`stopSec` 那一刻正好停在悬停点，再悬停 7/12 秒（到 6-2-6 末帧）。
// `decelStartSec`、`brakeSec`、`stopSec` 三个时刻不变（减速开始 6-2-6 段内 9.942 秒，停住 14.4 秒），配乐的渐弱（`beats.stop` 起）也不动；`brakeSec` 只剩镜头关键帧的一个时刻，扫帚在那里不再急刹。
// 收势：`decelStartSec` → `stopSec` 这 4.5 秒是一条速度曲线 v = 巡航 · (1 − u)^p · (1 + p·u)（u 从 0 到 1）：两头加速度都是 0（接巡航、停稳不顿），
// 平均速度是巡航的 2/(p + 2)，p 由「这段时间正好走完减速点到悬停点的里程」反解（约 3，最大减速度约 40 g）。爬升线照旧，减速后同一段路走得慢，扫帚在云层高度上多待一会儿
const cruiseFromSec = 29 / 12; // 起步走完、开始按巡航速度匀速飞
const launchOdometer = anchoredOdometer([[0, 0], [1 / 8, 1.2], [1 / 4, 6], [5 / 12, 26], [2 / 3, 90], [17 / 12, 650], [cruiseFromSec, 650 + cruiseSpeed]]);
const brakeSpeed = 430;
const preBrakeSec = 23 / 12;
const decelS = brakeS - (preBrakeSec * (cruiseSpeed + brakeSpeed)) / 2;
export const decelStartSec = cruiseFromSec + (decelS - launchOdometer(cruiseFromSec)) / cruiseSpeed;
// 急刹、停住、末帧按真值（原来落在 1/24 秒一格的格上，用户 11-16 定不留 1/24 秒的格）；停住、末帧离急刹的 61/24、75/24 秒是调好的长度
export const brakeSec = decelStartSec + preBrakeSec;
export const stopSec = brakeSec + 61 / 24;
export const endSec = brakeSec + 75 / 24; // 停住后悬停 7/12 秒
const hoverS = ROUTE.length;
const settleSec = stopSec - decelStartSec;
const settleStartS = launchOdometer(cruiseFromSec) + (decelStartSec - cruiseFromSec) * cruiseSpeed;
// 平均速度比 r = 2/(p + 2) → p = 2/r − 2
export const settleExponent = 2 / ((hoverS - settleStartS) / (cruiseSpeed * settleSec)) - 2;
if (!(settleExponent > 1.2 && settleExponent < 8)) throw new Error(`6-2-5/编排.ts 收势：反解出的 p = ${settleExponent}，减速段走不完或走不到悬停点`);
// ∫₀ᵘ (1 − x)^p (1 + p x) dx = [2 − (1 − u)^(p+1) (2 + p u)] / (p + 2)（u = 1 时 2/(p + 2)）
const settleOdometer = (globalSec: number) => {
  const progress = Math.min(1, Math.max(0, (globalSec - decelStartSec) / settleSec));
  const exponent = settleExponent;
  return settleStartS + cruiseSpeed * settleSec * ((2 - (1 - progress) ** (exponent + 1) * (2 + exponent * progress)) / (exponent + 2));
};
export const odometer = (T: number) =>
  T <= cruiseFromSec ? launchOdometer(T) : T <= decelStartSec ? launchOdometer(cruiseFromSec) + (T - cruiseFromSec) * cruiseSpeed : T <= stopSec ? settleOdometer(T) : hoverS + 0.01 * smoothstep01((T - stopSec) / (endSec - stopSec));

// 段表（全局秒；止是这一段末帧，下一段首帧 = 上一段末帧）：6-2-6 取最后 15 秒（含两头 900 帧，止 − 起 = 15 − 1/60 秒），前面都是 6-2-5
const frameSec = 1 / segFps;
const lastWindowSec = 15 - frameSec;
export const segmentTable = {
  '6-2-5': { start: 0, end: endSec - lastWindowSec },
  '6-2-6': { start: endSec - lastWindowSec, end: endSec },
} as const;
export type SegmentName = keyof typeof segmentTable;
export const segmentSpanSec = (segment: SegmentName) => segmentTable[segment].end - segmentTable[segment].start;
// 一段在拼段里放多长（秒）：段长加上末帧
export const segmentPlaySec = (segment: SegmentName) => segmentSpanSec(segment) + frameSec;
// 卡点（全局秒）：俯冲；穿云：俯冲到航点 W2 拉起；拉平：穿云后航线俯仰第一次回到 −3° 以上（降到巡航高度）；
// 城墙：开始往城那边看，在城从城东石山后面露出来之前一点（急刹前 3 秒）；减速：开始减速；急刹、停住。
// 穿云、拉平是过了那一处的那一刻（先按 1/60 秒找到哪一帧过的，再二分到真值），原来落在 1/24 秒的格上
const firstPassAfter = (fromSec: number, passed: (T: number) => boolean) => {
  let hi = fromSec;
  while (!passed(hi)) hi += frameSec;
  let lo = Math.max(fromSec, hi - frameSec);
  if (passed(lo)) return lo;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (passed(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
};
export const cloudPierceSec = firstPassAfter(2.5, (T) => odometer(T) >= ROUTE.waypointArcLen(2));
const levelOffSec = firstPassAfter(cloudPierceSec, (T) => headingPitch(ROUTE.dir(odometer(T))).pitch >= -3);
// 离转弯点最近的那一刻（核对用）：先按 1/60 秒找最近的一帧，再在前后一帧里三分
const turnSec = (() => {
  const distAt = (T: number) => {
    const pos = ROUTE.at(odometer(T));
    return Math.hypot(pos[0] - turnPoint[0], pos[1] - turnPoint[1]);
  };
  let best = 0;
  for (let T = 0; T <= brakeSec; T += frameSec) if (distAt(T) < distAt(best)) best = T;
  let [lo, hi] = [Math.max(0, best - frameSec), best + frameSec];
  for (let k = 0; k < 80; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (distAt(m1) < distAt(m2)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
})();
export const beats = {
  dive: 61 / 24,
  cloudPierce: cloudPierceSec,
  levelOff: levelOffSec,
  turn: turnSec,
  townWall: brakeSec - 3,
  decelStart: decelStartSec,
  hardBrake: brakeSec,
  stop: stopSec,
  end: endSec,
};
