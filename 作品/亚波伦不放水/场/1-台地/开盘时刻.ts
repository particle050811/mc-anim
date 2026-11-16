// 第 1、2 幕的时刻、两人的走位：编排-开盘.ts 照这里排动作，段 1-召唤、2-开盘 的 段.ts 照这里卡声音（段.ts 要纯模块，编排-开盘.ts 引了模型、贴图，引不了）。
// 纯计算。时刻、站位都是 Agent 取的，用户没看过。
// 坐标：本地 = 以祭坛那一列为原点（x 东、y 北），高从祭坛那层地面（游戏 y 50）算。
// 编排的钟 = 现身后几秒；第 2 幕里编排的钟走世界秒（幕(w) = 幕起 + w，w 是 开盘拍.ts 的幕内世界秒），慢放由画面换钟（段内片秒 → 世界秒）。
import { dashPos, calcDash, groundElevMax, type DashTrail } from '../../物品/断曜流光冲刺.ts';
import { baseCells, soulFireCells, appearPos } from '../../特效/安息仪式时序.ts';
import { footHeight } from './布局.ts';
import { beats, slowMo, toClipSec, actDur } from './开盘拍.ts';
import { pointTrack, type TrackPoint } from './轨迹.ts';
import timeline from './时间线.ts';

export { beats, slowMo, toClipSec, actDur };
const events = timeline.events;
/** 第 2 幕开头（编排的钟 = 现身后几秒） */
export const actStart = events.summonDone.sec - events.yaBoLunAppears.sec;
/** 第 2 幕幕内世界秒 → 编排的钟 */
export const act = (w: number) => actStart + w;
/** 第 2 幕末（编排的钟，世界秒）：这之后两人都停在末态，第 4 幕从这里接 */
export const actEnd = act(beats.endSec);

// 和场时间线的事件对上（时间线.ts 从 开盘拍.ts 算的，这里防两边各改各的）
for (const [eventName, beatTime] of [['firstDash', beats.dashFirstSec], ['teleport', beats.移], ['secondDash', beats.dashSecondSec], ['wheelOpens', beats.openWheelSec], ['wheelOpenDone', beats.endSec]] as const) {
  const timeDiffSec = events[eventName].sec - events.summonDone.sec - toClipSec(beatTime);
  if (Math.abs(timeDiffSec) > 1e-9) throw new Error(`开盘时刻：时间线的 ${eventName} 和 开盘拍.ts 差 ${timeDiffSec} 秒`);
}

// ── 场地 ──
const altarGame = { x: 898.5, z: -299.5 };
const altarFootHeight = footHeight(altarGame.x, altarGame.z);
/** 本地 (x, y) 那一列的地面比祭坛那层高几格 */
export const localGroundHeight = (x: number, y: number) => footHeight(altarGame.x + x, altarGame.z - y) - altarFootHeight;
/** 基座、灵魂土、哭泣黑曜石台子比地面高一格 */
export const structureHeight = (x: number, y: number): number => {
  const [i, j] = [Math.round(x), Math.round(y)];
  if (Math.abs(i) <= 1 && Math.abs(j) <= 1) return 1;
  if (baseCells.some(([a, b]) => a === i && b === j)) return 1;
  if (soulFireCells.some(([a, b]) => a === i && b === j)) return 1;
  return 0;
};
/** 站得住的高（本地） */
export const standHeight = (x: number, y: number) => localGroundHeight(x, y) + structureHeight(x, y);

// ── 第 1 幕（编排的钟：现身后几秒，现身前是负的） ──
export const act1 = {
  /** 右键把环放上祭坛那一下挥手（放环 事件前 0.08 秒点下去） */
  ringReleaseSec: -6.08,
  /** 仪式完成的光柱起来，他往后一缩、拔剑（右手从空换成剑） */
  drawSwordSec: -3.3,
  /** 她甩杖 */
  staffFlick: [1.38, 1.55] as const,
};
/** 他第 1 幕的平面走位（本地 x、y）：开头已经走到基座外（用户 11-11 删了他走过来那一镜），站住、右键把环放上祭坛，快步退开；
 *  仪式完成的光柱起来往后一缩、拔剑；黑暗、低语里左右挪步；她现身那一下往后一跳步，再往中间挪、压低重心。写了速度 0 的点是站住。
 *  −6.35 起和删镜之前一样，开头那一点照原来的走法往回推 0.05 秒 */
export const steveFirstPath: readonly TrackPoint[] = [
  [-6.4, [-0.07, -5.38], [0.05, 3.7]],
  [-6.35, [-0.05, -5.2], [0, 3.6]],
  [-6.12, [0, -4.3], [0, 0]],
  [-5.85, [0, -4.32], [0, 0]],
  [-5.35, [0.1, -6.6]],
  [-4.8, [0.25, -7.6], [0.3, -0.8]],
  [-4.0, [0.3, -8.0]],
  [-3.55, [0.3, -8.1], [0, 0]],
  [-3.3, [0.35, -8.9], [0, 0]],
  [-2.9, [0.1, -8.8]],
  [-2.4, [-1.3, -8.6], [0, 0]],
  [-1.95, [-1.2, -8.75]],
  [-1.45, [0.2, -8.9]],
  [-0.9, [1.4, -8.7], [0, 0]],
  [-0.3, [1.3, -8.8]],
  [0.0, [1.2, -8.9]],
  [0.25, [1.0, -9.8], [0, 0]],
  [0.8, [0.8, -9.5]],
  [1.6, [0.5, -9.1]],
  [2.3, [0.4, -8.75], [0, 0.4]],
  [actStart - 0.04, [0.4, -8.6], [0, 0]],
];
if (steveFirstPath[0]![0] !== events.开始.sec - events.yaBoLunAppears.sec) throw new Error('开盘时刻：史一 要从第 1 幕开头起');
const steveTrack = pointTrack(steveFirstPath);
/** 第 1 幕他的脚步声（编排的钟）：照原版 Entity.move，走过的路程每 1/0.6 格响一步 */
export const act1Steps: readonly number[] = (() => {
  const stepSec = 1 / 240;
  const stepTimes: number[] = [];
  let [travelled, nextStep] = [0, 1 / 0.6];
  let prev = steveTrack(steveFirstPath[0]![0]);
  for (let t = steveFirstPath[0]![0] + stepSec; t <= actStart; t += stepSec) {
    const p = steveTrack(t);
    travelled += Math.hypot(p[0]! - prev[0]!, p[1]! - prev[1]!);
    prev = p;
    if (travelled >= nextStep) {
      stepTimes.push(t);
      nextStep += 1 / 0.6;
    }
  }
  return stepTimes;
})();

// ── 第 2 幕：断曜流光冲两次 ──
// 站位倒着定：第 4 幕要他停在 受困本地、她停在祭坛上空 悬停高。他第二次冲（视线不往上，第一刻就贴地，10.8 格）正好停在 受困本地；
// 第一次冲（仰 2.25 度，15.8 格）从他第 1 幕末站的地方出发、停在第二次冲的起点（两个圆的交点，取北边那个：南边那个落在高一格的坡上）。
// 两条路都绕开基座、灵魂火（第一次从祭坛东边 3～4 格擦过去）和 x 9～11、y −3～1 那片低一格的洼地（第二次贴着它西沿过去，碰撞箱一半压着实地，不掉下去）。
export const trappedLocal = [8, -6] as const;
/** 悬停的高度（脚底离地），分镜 2-02「约 12 格高」 */
export const hoverHeight = 12;
/** 潜行时眼高（库/角色/史蒂夫.tsx 的 eyeCrouch，0.9375 倍；编排-开盘.ts 载入时核对） */
export const sneakEyeHeight = 1.27;
/** 她「胸口」比脚底高几格：他对着这里瞄 */
export const yaBoLunChestHeight = 1.1;
const firstElevationDeg = 2.25;
/** 他第 1 幕末站的地方 */
const from = steveFirstPath[steveFirstPath.length - 1]![1] as readonly [number, number];
const dashTrack = (startPos: readonly number[], dir: readonly [number, number], elevationDeg: number): DashTrail => calcDash({ start: [startPos[0]!, startPos[1]!, standHeight(startPos[0]!, startPos[1]!)], dir, elevationDeg, groundHeight: standHeight });
const unitVec = (x: number, y: number): [number, number] => {
  const n = Math.hypot(x, y);
  return [x / n, y / n];
};
/** 两个圆（圆心 a 半径 ra，圆心 b 半径 rb）北边的交点 */
const circleIntersect = (a: readonly number[], ra: number, b: readonly number[], rb: number): [number, number] => {
  const d = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
  const e = [(b[0]! - a[0]!) / d, (b[1]! - a[1]!) / d];
  const bottomDist = (ra * ra - rb * rb + d * d) / (2 * d);
  const h = Math.sqrt(ra * ra - bottomDist * bottomDist);
  const [c, n] = [[a[0]! + bottomDist * e[0]!, a[1]! + bottomDist * e[1]!], [-e[1]!, e[0]!]];
  const [p, q]: [number, number][] = [[c[0]! + h * n[0]!, c[1]! + h * n[1]!], [c[0]! - h * n[0]!, c[1]! - h * n[1]!]];
  return p[1] > q[1] ? p : q;
};
const dashSetup = (() => {
  // 平地上冲多远只看仰角（落地那一刻），先在平地上量一次，再照真地形迭代两次
  const flatCharge = (elevationDeg: number) => calcDash({ start: [0, 0, 0], dir: [1, 0], elevationDeg, groundHeight: () => 0 }).farDist;
  let [farFirst, farSecond] = [flatCharge(firstElevationDeg), flatCharge(-1)];
  let secondStart: [number, number] = [0, 0];
  for (let i = 0; i < 3; i++) {
    secondStart = circleIntersect(from, farFirst, trappedLocal, farSecond);
    farFirst = dashTrack(from, unitVec(secondStart[0] - from[0], secondStart[1] - from[1]), firstElevationDeg).farDist;
    farSecond = dashTrack(secondStart, unitVec(trappedLocal[0] - secondStart[0], trappedLocal[1] - secondStart[1]), -1).farDist;
  }
  return { firstDir: unitVec(secondStart[0] - from[0], secondStart[1] - from[1]), secondStart, secondDir: unitVec(trappedLocal[0] - secondStart[0], trappedLocal[1] - secondStart[1]) };
})();
export const firstDir = dashSetup.firstDir;
export const secondDir = dashSetup.secondDir;
export const secondStart = dashSetup.secondStart;
// 她第一次悬停的地方：他冲的那条线上、离他 一距 格，高度让他对着她胸口正好仰 一仰 度
const firstDist = 6;
const firstFlatPoint = [from[0] + firstDir[0] * firstDist, from[1] + firstDir[1] * firstDist] as const;
/** 她第一次悬停（脚底，本地） */
export const hoverFirst: readonly [number, number, number] = [firstFlatPoint[0], firstFlatPoint[1], standHeight(...from) + sneakEyeHeight + firstDist * Math.tan((firstElevationDeg * Math.PI) / 180) - yaBoLunChestHeight];
// 她瞬移去的地方：他第二次冲的那条线上、离二起 二距 格，贴地（他冲之前她往下一沉，他对着她胸口是往下看，第一刻就贴地）
const secondDist = 5.5;
/** 她瞬移出来（脚底，本地）、往下沉到哪 */
export const hoverSecond: readonly [number, number, number] = [secondStart[0] + secondDir[0] * secondDist, secondStart[1] + secondDir[1] * secondDist, 0.45];
export const sinkDepth = 0.2;
export const secondElevationDeg = (Math.atan2(sinkDepth + yaBoLunChestHeight - sneakEyeHeight - standHeight(...secondStart), secondDist) * 180) / Math.PI;
if (!(secondElevationDeg <= groundElevMax)) throw new Error(`开盘时刻：第二次冲仰 ${secondElevationDeg} 度，超过 ${groundElevMax} 度就不贴地、冲得比 10.8 格远，停不到受困位`);
export const firstDash = dashTrack(from, firstDir, firstElevationDeg);
export const secondDash = dashTrack(secondStart, secondDir, secondElevationDeg);
for (const [passName, track, target] of [['第一次', firstDash, secondStart], ['第二次', secondDash, trappedLocal]] as const) {
  const lastPoint = track.points[track.points.length - 1]!;
  if (Math.hypot(lastPoint[0] - target[0], lastPoint[1] - target[1]) > 0.01) throw new Error(`开盘时刻：${passName}冲停在 (${lastPoint[0]}, ${lastPoint[1]})，差 ${target} 太多`);
}
export { firstElevationDeg };

/** 他在第 2 幕的位置（本地，幕内世界秒）：冲之前站着，冲的时候照 冲刺位，冲完蹲着不动 */
export const steveSecondLocal = (w: number): [number, number, number] => {
  if (w < beats.dashFirstSec) return [from[0], from[1], standHeight(...from)];
  if (w < beats.dashSecondSec) return [...dashPos(firstDash, w - beats.dashFirstSec)];
  // 冲停的地方和 受困本地 差不到 0.01 格（迭代剩下的）：冲出去 0.5～0.7 秒（第 10～14 刻，已经慢得几乎不动）里挪过去，之后就站在 受困本地
  if (w >= beats.dashSecondSec + 0.7) return [trappedLocal[0], trappedLocal[1], standHeight(...trappedLocal)];
  const p = dashPos(secondDash, w - beats.dashSecondSec);
  const lastPoint = secondDash.points[secondDash.points.length - 1]!;
  const k = Math.min(1, Math.max(0, (w - beats.dashSecondSec - 0.5) / 0.2));
  return [p[0] + (trappedLocal[0] - lastPoint[0]) * k, p[1] + (trappedLocal[1] - lastPoint[1]) * k, p[2]];
};
/** 两次冲在转（激流姿势）的世界秒：[起, 止) */
export const turnWindows = [beats.dashFirstSec, beats.dashSecondSec].map((startSec) => [startSec, startSec + 15 / 20] as const);
/** 两次冲第一次落地（世界秒） */
export const landTimes = [[beats.dashFirstSec, firstDash], [beats.dashSecondSec, secondDash]].map(([startSec, track]) => (startSec as number) + (track as DashTrail).landTick / 20);

// 她：现身点 → 飞到悬一 → 瞬移到悬二、刹住 → 往下一沉 → 往祭坛上空拉（先往上、再往西弯过去）→ 刹在 终点
const appearLocal = [appearPos[0], appearPos[1], appearPos[2]] as const;
export const endLocal = [appearPos[0], appearPos[1], hoverHeight] as const;
const addVec = (a: readonly number[], b: readonly number[], k = 1) => a.map((x, j) => x + b[j]! * k);
// 飞到悬一：往东飘出祭坛、从东边基座上头过去，再往南斜着冲下来刹在他面前（东南角的灵魂火在她右手边一格多，不从火上穿过去）
const yaBoLunPointsFirst: readonly TrackPoint[] = [
  [beats.takeoff, appearLocal, [0, 0, 0]],
  [beats.takeoff + 0.08, [0.9, -0.2, 2.75], [14, -4, 1]],
  [beats.arriveSec - 0.11, [3.2, -1.6, 1.5], [6, -12, -6]],
  [beats.arriveSec, hoverFirst, [0, 0, 0]],
];
// 瞬移出来带着一点往东南的冲势，0.16 秒刹住，悬着转向他；沉：往下一沉（预备）
const dashExit = [1.2, -1.6, 0] as const;
const yaBoLunPointsSecond: readonly TrackPoint[] = [
  [beats.移, addVec(hoverSecond, dashExit, -0.08), dashExit],
  [beats.移 + 0.16, hoverSecond, [0, 0, 0]],
  [beats.sinkSec, hoverSecond, [0, 0, 0]],
  [beats.liftStart, [hoverSecond[0], hoverSecond[1], sinkDepth], [0, 0, 0]],
];
// 拉：他挥剑前 0.06 秒起，3 帧里提到 27 格/秒往上蹿（他从她脚底下冲过去时她离他身外的旋风还有 0.4 格以上，测试查），往西弯向祭坛上空，最后 0.16 秒刹住
const pullTrack: TrackPoint[] = (() => {
  const t0 = beats.liftStart;
  const startPos = [hoverSecond[0], hoverSecond[1], sinkDepth];
  return [
    [t0, startPos, [0, 0, 0]],
    [t0 + 0.05, addVec(startPos, [-0.05, 0.02, 0.68]), [-2, 0.5, 27]],
    [t0 + 0.24, addVec(startPos, [-1.3, 0.1, 5.6]), [-12, 0.6, 22]],
    [beats.peakSec - 0.16, addVec(endLocal, [2.0, -0.1, -0.85]), [-24, 1, 10]],
    [beats.peakSec, endLocal, [0, 0, 0]],
  ];
})();
const [yaBoLunPathFirst, yaBoLunPathSecond] = [pointTrack(yaBoLunPointsFirst), pointTrack([...yaBoLunPointsSecond, ...pullTrack.slice(1)])];
/** 她在第 2 幕的脚底（本地，幕内世界秒）；瞬移那一刻跳变 */
export const yaBoLunSecondLocal = (w: number): [number, number, number] => (w < beats.移 ? yaBoLunPathFirst(w) : yaBoLunPathSecond(w)) as [number, number, number];
/** 她第 2 幕开头之前（第 1 幕）站在现身点 */
export const yaBoLunAppearLocal = appearLocal;
