// 全局秒 → 里程（起步、巡航、收势减速、悬停），段表和卡点。
// 这里的段是旧段号的窗口（编排、声音按它分），成片的段界（拼成哪几个 Composition）见 ../../6-2至6-3段界/段表.ts。
import { headingPitch, anchoredOdometer } from '@engine/flight/飞行路径.ts';
import { cruiseSpeed, turnPoint, ROUTE, brakeS } from './航线.ts';
import { smoothstep01 } from '@engine/core/数学.ts';

// ---------- 时间线（全局秒） ----------
// 里程：前 29/12 秒（33.1 从几乎停着往前冲出去，前 2/3 秒草束离开镜头，17/12 秒前后到巡航速度），之后每秒一公里，从 `decelStartSec` 起一路减速，`stopSec` 那一刻正好停在悬停点，再悬停 7/12 秒（到 6-2-6 末帧）。
// `decelStartSec`、`brakeSec`、`stopSec` 三个时刻不变（减速开始 6-2-6 段内 9.917 秒，停住 14.375 秒），配乐的渐弱（`beats.stop` 起）也不动；`brakeSec` 只剩镜头关键帧的一个时刻，扫帚在那里不再急刹。
// 收势：`decelStartSec` → `stopSec` 这 4.5 秒是一条速度曲线 v = 巡航 · (1 − u)^p · (1 + p·u)（u 从 0 到 1）：两头加速度都是 0（接巡航、停稳不顿），
// 平均速度是巡航的 2/(p + 2)，p 由「这段时间正好走完减速点到悬停点的里程」反解（约 3，最大减速度约 40 g）。爬升线照旧，减速后同一段路走得慢，扫帚在云层高度上多待一会儿
const cruiseFromSec = 29 / 12; // 起步走完、开始按巡航速度匀速飞
const launchOdometer = anchoredOdometer([[0, 0], [1 / 8, 1.2], [1 / 4, 6], [5 / 12, 26], [2 / 3, 90], [17 / 12, 650], [cruiseFromSec, 650 + cruiseSpeed]]);
const brakeSpeed = 430;
const preBrakeSec = 23 / 12;
const decelS = brakeS - (preBrakeSec * (cruiseSpeed + brakeSpeed)) / 2;
export const decelStartSec = cruiseFromSec + (decelS - launchOdometer(cruiseFromSec)) / cruiseSpeed;
// 急刹以及跟着它的停住、末帧落在旧版 1/24 秒一格的格上：整段飞行的长由它定，去掉取整的话飞行段长、拼段的段界和后面全部 cue 都要挪到 1/60 秒的格以外
const oldCellsPerSec = 24;
const brakeCell = Math.ceil((decelStartSec + preBrakeSec) * oldCellsPerSec);
export const brakeSec = brakeCell / oldCellsPerSec;
export const stopSec = (brakeCell + 61) / oldCellsPerSec;
export const endSec = (brakeCell + 75) / oldCellsPerSec; // 停住后悬停 7/12 秒
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

// 段表（全局秒；止是这一段末格的起点，下一段首格 = 上一段末格）：6-2-6 取最后 15 秒（含两头 360 格，止 − 起 = 359/24 秒），前面都是 6-2-5
const lastWindowSec = 359 / 24;
export const segmentTable = {
  '6-2-5': { 起: 0, 止: endSec - lastWindowSec },
  '6-2-6': { 起: endSec - lastWindowSec, 止: endSec },
} as const;
export type SegmentName = keyof typeof segmentTable;
export const segmentSpanSec = (segment: SegmentName) => segmentTable[segment].止 - segmentTable[segment].起;
// 一段在拼段里放多长（秒）：段长加上末格（旧版 1/24 秒一格）
export const segmentPlaySec = (segment: SegmentName) => segmentSpanSec(segment) + 1 / oldCellsPerSec;
// 卡点（全局秒）：俯冲；穿云：俯冲到航点 W2 拉起；拉平：穿云后航线俯仰第一次回到 −3° 以上（降到巡航高度）；
// 城墙：开始往城那边看，在城从城东石山后面露出来之前一点（急刹前 3 秒）；减速：开始减速；急刹、停住。
// 穿云、拉平、减速照旧落在 1/24 秒的格上（穿云、拉平是「过了那一处的第一格」，减速取最近的一格）：这几个是镜头关键帧和扰动锚点，去掉取整或对到 1/60 秒都要挪 1/120 秒以上
const firstCellAfter = (fromCell: number, passed: (T: number) => boolean) => {
  let cell = fromCell;
  while (!passed(cell / oldCellsPerSec)) cell++;
  return cell;
};
const cloudPierceCell = firstCellAfter(60, (T) => odometer(T) >= ROUTE.waypointArcLen(2));
export const cloudPierceSec = cloudPierceCell / oldCellsPerSec;
const levelOffSec = firstCellAfter(cloudPierceCell, (T) => headingPitch(ROUTE.dir(odometer(T))).pitch >= -3) / oldCellsPerSec;
// 离转弯点最近的那一格（核对用）
const turnSec = (() => {
  let best = 0;
  let bestDist = Infinity;
  for (let cell = 0; cell <= brakeCell; cell++) {
    const pos = ROUTE.at(odometer(cell / oldCellsPerSec));
    const dist = Math.hypot(pos[0] - turnPoint[0], pos[1] - turnPoint[1]);
    if (dist < bestDist) [bestDist, best] = [dist, cell];
  }
  return best / oldCellsPerSec;
})();
export const beats = {
  dive: 61 / 24,
  cloudPierce: cloudPierceSec,
  levelOff: levelOffSec,
  turn: turnSec,
  townWall: brakeSec - 3,
  decelStart: Math.round(decelStartSec * oldCellsPerSec) / oldCellsPerSec,
  hardBrake: brakeSec,
  stop: stopSec,
  end: endSec,
};
