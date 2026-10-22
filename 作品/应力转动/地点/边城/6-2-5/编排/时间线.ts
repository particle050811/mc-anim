// 帧 → 里程（起步、巡航、收势减速、悬停），段表和卡点。
// 这里的段是旧段号的窗口（编排、声音按它分），成片的段界（拼成哪几个 Composition）见 ../../6-2至6-3段界/段表.ts。
import { headingPitch, anchoredOdometer } from '@engine/flight/飞行路径.ts';
import { ss } from './工具.ts';
import { cruiseSpeed, turnPoint, ROUTE, brakeS } from './航线.ts';

// ---------- 时间线 ----------
// 里程：前 58 帧（33.1 从几乎停着往前冲出去，前 16 帧草束离开镜头，34 帧前后到巡航速度），之后每秒一公里，从 `decelStartG` 起一路减速，`stopG` 那一帧正好停在悬停点，再悬停 14 帧（6-2-6 末帧 = 悬停 14 帧）。
// `decelStartG`、`brakeG`、`stopG` 三个时刻的帧号不变（减速开始 6-2-6 第 238 帧，停住第 345 帧），配乐的渐弱（`beats.停住` 起）也不动；`brakeG` 只剩镜头关键帧的一个时刻，扫帚在那里不再急刹。
// 收势：`decelStartG` → `stopG` 这 4.5 秒是一条速度曲线 v = 巡航 · (1 − u)^p · (1 + p·u)（u 从 0 到 1）：两头加速度都是 0（接巡航、停稳不顿），
// 平均速度是巡航的 2/(p + 2)，p 由「这段时间正好走完减速点到悬停点的里程」反解（约 3，最大减速度约 40 g）。爬升线照旧，减速后同一段路走得慢，扫帚在云层高度上多待一会儿
const speedPerFrame = cruiseSpeed / 24; // 每帧多少米
const launchOdometer = anchoredOdometer([[0, 0], [3, 1.2], [6, 6], [10, 26], [16, 90], [34, 650], [58, 650 + 24 * speedPerFrame]]);
const brakeSpeed = 430;
const preBrakeFrames = 46;
const decelS = brakeS - (preBrakeFrames * (cruiseSpeed + brakeSpeed)) / 2 / 24;
export const decelStartG = 58 + (decelS - launchOdometer(58)) / speedPerFrame;
export const brakeG = Math.ceil(decelStartG + preBrakeFrames);
export const stopG = brakeG + 61;
export const endG = stopG + 14;
const hoverS = ROUTE.length;
const settleFrames = stopG - decelStartG;
const settleStartS = launchOdometer(58) + (decelStartG - 58) * speedPerFrame;
// 平均速度比 r = 2/(p + 2) → p = 2/r − 2
export const settleExponent = 2 / ((hoverS - settleStartS) / (speedPerFrame * settleFrames)) - 2;
if (!(settleExponent > 1.2 && settleExponent < 8)) throw new Error(`6-2-5/编排.ts 收势：反解出的 p = ${settleExponent}，减速段走不完或走不到悬停点`);
// ∫₀ᵘ (1 − x)^p (1 + p x) dx = [2 − (1 − u)^(p+1) (2 + p u)] / (p + 2)（u = 1 时 2/(p + 2)）
const settleOdometer = (globalFrame: number) => {
  const progress = Math.min(1, Math.max(0, (globalFrame - decelStartG) / settleFrames));
  const exponent = settleExponent;
  return settleStartS + speedPerFrame * settleFrames * ((2 - (1 - progress) ** (exponent + 1) * (2 + exponent * progress)) / (exponent + 2));
};
export const odometer = (G: number) => (G <= 58 ? launchOdometer(G) : G <= decelStartG ? launchOdometer(58) + (G - 58) * speedPerFrame : G <= stopG ? settleOdometer(G) : hoverS + 0.01 * ss((G - stopG) / (endG - stopG)));

// 段表（全局帧，含两头；下一段首帧 = 上一段末帧）：6-2-6 取最后 15 秒（360 帧），前面都是 6-2-5
export const segmentTable = {
  '6-2-5': { 起: 0, 止: endG - 359 },
  '6-2-6': { 起: endG - 359, 止: endG },
} as const;
export type SegmentName = keyof typeof segmentTable;
export const segmentFrames = (segment: SegmentName) => segmentTable[segment].止 - segmentTable[segment].起 + 1;
// 卡点（全局帧）：俯冲；穿云：俯冲到航点 W2 拉起；拉平：穿云后航线俯仰第一次回到 −3° 以上（降到巡航高度）；
// 城墙：开始往城那边看，在城从城东石山后面露出来之前一点（急刹前 3 秒）；减速：开始减速；急刹、停住
export const cloudPierceG = (() => {
  let frame = 60;
  while (odometer(frame) < ROUTE.waypointArcLen(2)) frame++;
  return frame;
})();
const levelOffG = (() => {
  let frame = cloudPierceG;
  while (headingPitch(ROUTE.dir(odometer(frame))).pitch < -3) frame++;
  return frame;
})();
// 离转弯点最近的那一帧（核对用）
const turnG = (() => {
  let best = 0;
  let bestDist = Infinity;
  for (let frame = 0; frame <= brakeG; frame++) {
    const pos = ROUTE.at(odometer(frame));
    const dist = Math.hypot(pos[0] - turnPoint[0], pos[1] - turnPoint[1]);
    if (dist < bestDist) [bestDist, best] = [dist, frame];
  }
  return best;
})();
export const beats = {
  dive: 61,
  cloudPierce: cloudPierceG,
  levelOff: levelOffG,
  转弯: turnG,
  townWall: brakeG - 72,
  decelStart: Math.round(decelStartG),
  hardBrake: brakeG,
  stopFrame: stopG,
  lastFrame: endG,
};
