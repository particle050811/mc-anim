// 第 1、2 幕的时刻、两人的走位：编排-开盘.ts 照这里排动作，段 1-召唤、2-开盘 的 段.ts 照这里卡声音（段.ts 要纯模块，编排-开盘.ts 引了模型、贴图，引不了）。
// 纯计算。时刻、站位都是 Agent 取的，用户没看过。
// 坐标：本地 = 以祭坛那一列为原点（x 东、y 北），高从祭坛那层地面（游戏 y 50）算。
// 编排的钟 = 现身后几秒；第 2 幕里编排的钟走世界秒（幕(w) = 幕起 + w，w 是 开盘拍.ts 的幕内世界秒），慢放由画面换钟（段内片秒 → 世界秒）。
import { dashPos, calcDash, groundElevMax, type DashTrail } from '../../物品/断曜流光冲刺.ts';
import { baseCells, soulFireCells, appearPos } from '../../特效/安息仪式时序.ts';
import { footHeight, openingPerch } from './布局.ts';
import { beats, slowMo, toClipSec, actDur } from './开盘拍.ts';
import { pointTrack, type TrackPoint } from './轨迹.ts';
import timeline from './时间线.ts';

export { beats, slowMo, toClipSec, actDur };
const events = timeline.events;
/** 第 2 幕开头（编排的钟 = 现身后几秒） */
export const actStart = events.summonDone.sec - events.yaBoLunAppears.sec;
/** 第 1 幕比原来短几秒（用户 11-19 嫌他到位后「罚站」，现身到第 2 幕从 2.8 秒剪到 时间线.ts 的现身到召唤完）：
 *  她的动画、浮动相位往后照剪之前的走（亚波伦演出.ts 的 animLead），第 2、4 幕她的样子和用户看过的一样 */
export const act1TrimSec = 2.8 - actStart;
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
  medalReleaseSec: -6.08,
  /** 仪式完成的光柱起来，他往后一缩、拔剑（右手从空换成剑） */
  drawSwordSec: -3.3,
  /** 她甩杖 */
  staffFlick: [1.38, 1.55] as const,
};
export const trappedLocal = [8, -6] as const;
export const hoverHeight = openingPerch[2];
export const firstElevationDeg = 2.25;
const firstProfile = { gain: 2.5, airDrag: 0.9775, groundDrag: 0.3695 };
const secondProfile = { gain: 2.5, airDrag: 1, groundDrag: 0.4075 };
const directionAt = (degrees: number): [number, number] => [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180)];
export const firstDir = directionAt(232);
export const secondDir = directionAt(42);
export const sneakEyeHeight = 1.27;
export const yaBoLunChestHeight = 1.1;
export const sinkDepth = 0.2;
const firstDist = 24, secondDist = 18;
export const secondElevationDeg = Math.atan2(sinkDepth + yaBoLunChestHeight - sneakEyeHeight, secondDist) * 180 / Math.PI;
const backtrackStart = (end: readonly number[], direction: [number, number], elevationDeg: number, horizontalMotion: typeof firstProfile): [number, number] => {
  const distance = calcDash({ start: [0, 0, 0], dir: direction, elevationDeg: elevationDeg, groundHeight: () => 0, horizontalMotion }).farDist;
  return [end[0]! - distance * direction[0], end[1]! - distance * direction[1]];
};
// 正式地形的东侧窄脊和南侧折返点。平地公式只倒推设计起点，真正运动仍查四角脚高，终点另验。
export const secondStart = backtrackStart(trappedLocal, secondDir, secondElevationDeg, secondProfile);
const from = backtrackStart(secondStart, firstDir, firstElevationDeg, firstProfile);
// 用户 11-19「召唤出亚伯伦以后为什么还要往后退……应该改成在召唤时就已经退开了足够的距离 后面只往前冲」：
// 原来她现身后他从祭坛南边绕过祭坛、往东北退到一冲起点（1-04 越肩镜里看着是越跑越远）。现在：1-01 里他看着祭坛往东南退、拔剑；
// 切到 1-02（镜头在祭坛正东往西看，他在镜头右后方）他不在画面里，从镜头背后绕到一冲起点东北边一点，她现身时已经到了；
// 之后（1-04 里）只顺着一冲的方向压低身子往前挪到起点，她甩完杖第 2 幕就开始、他接着冲（用户同日嫌到位后「罚站」，第 2 幕提前，见 时间线.ts）。一冲起点、第 2 幕、受困位都没动
const creepBack = 1.6; // 到位时站在一冲起点身后几格，往前挪过去
const creepFrom = (k: number): [number, number] => [from[0] - firstDir[0] * creepBack * k, from[1] - firstDir[1] * creepBack * k];
export const steveFirstPath: readonly TrackPoint[] = [
  [-6.4, [-0.07, -5.38], [0.05, 3.7]],
  [-6.35, [-0.05, -5.2], [0, 3.6]],
  [-6.12, [0, -4.3], [0, 0]],
  [-5.85, [0, -4.32], [0, 0]],
  [-5.35, [0.7, -5.9]],
  [-4.8, [2.0, -6.7]],
  [-4.0, [3.5, -7.1]],
  [-3.55, [4.2, -7.4], [0, 0]],
  [-3.3, [5.0, -7.9], [0, 0]],
  [-2.9, [5.5, -8.0]],
  // 1-02 起（切镜在 −2.7 秒）：从镜头背后跑过去（祭坛东边都是平地，x 9～11 有一格浅坑）
  [-2.4, [8.0, -6.5]],
  [-1.5, [12.0, -2.0]],
  [-0.6, [14.0, 3.6]],
  [0.5, creepFrom(1), [0, 0]],
  [1.0, creepFrom(0.6)],
  [1.45, creepFrom(0.25)],
  [actStart - 0.04, from, [0, 0]],
];
if (steveFirstPath[0]![0] !== events.开始.sec - events.yaBoLunAppears.sec) throw new Error('开盘时刻：史一 要从第 1 幕开头起');
export const act1Steps: readonly number[] = (() => {
  const path = pointTrack(steveFirstPath);
  const start = steveFirstPath[0]![0];
  const times: number[] = [];
  let phase = 0, previous = path(start);
  for (let tick = 1; start + tick / 240 <= actStart; tick++) {
    const time = start + tick / 240, current = path(time);
    phase += Math.min(4.8 / 240, 0.6 * Math.hypot(current[0]! - previous[0]!, current[1]! - previous[1]!));
    if (phase >= 1) { times.push(time); phase -= 1; }
    previous = current;
  }
  return times;
})();
const dashTrack = (start: readonly [number, number], dir: [number, number], elevationDeg: number, horizontalMotion: typeof firstProfile): DashTrail => calcDash({ start: [...start, standHeight(...start)], dir, elevationDeg, groundHeight: standHeight, horizontalMotion });
// 她第一次悬停的地方：他冲的那条线上、离他 一距 格，高度让他对着她胸口正好仰 一仰 度
const firstFlatPoint = [from[0] + firstDir[0] * firstDist, from[1] + firstDir[1] * firstDist] as const;
/** 她第一次悬停（脚底，本地） */
export const hoverFirst: readonly [number, number, number] = [firstFlatPoint[0], firstFlatPoint[1], standHeight(...from) + sneakEyeHeight + firstDist * Math.tan((firstElevationDeg * Math.PI) / 180) - yaBoLunChestHeight];
// 她瞬移去的地方：他第二次冲的那条线上、离二起 二距 格，贴地（他冲之前她往下一沉，他对着她胸口是往下看，第一刻就贴地）
/** 她瞬移出来（脚底，本地）、往下沉到哪 */
export const hoverSecond: readonly [number, number, number] = [secondStart[0] + secondDir[0] * secondDist, secondStart[1] + secondDir[1] * secondDist, 0.45];
if (secondElevationDeg > groundElevMax) throw new Error('二冲必须首刻贴地');
export const firstDash = dashTrack(from, firstDir, firstElevationDeg, firstProfile);
export const secondDash = dashTrack(secondStart, secondDir, secondElevationDeg, secondProfile);
for (const [passName, track, target] of [['第一次', firstDash, secondStart], ['第二次', secondDash, trappedLocal]] as const) {
  const lastPoint = track.points[track.points.length - 1]!;
  if (Math.hypot(lastPoint[0] - target[0], lastPoint[1] - target[1]) > 0.01) throw new Error(`开盘时刻：${passName}冲停在 (${lastPoint[0]}, ${lastPoint[1]})，差 ${target} 太多`);
}

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
export const endLocal = openingPerch;
const addVec = (a: readonly number[], b: readonly number[], k = 1) => a.map((x, j) => x + b[j]! * k);
const yaBoLunPointsFirst: readonly TrackPoint[] = [
  [beats.takeoff, appearLocal, [0, 0, 0]],
  [beats.takeoff + 0.10, [0, -3.8, 2.8], [0, -55, 0]],
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
const pullTrack: TrackPoint[] = (() => {
  const start = [hoverSecond[0], hoverSecond[1], sinkDepth];
  const begin = beats.liftStart, finish = beats.peakSec;
  const riseRamp = 0.05, riseEnd = 0.16, turnDuration = 0.11, brakeDuration = 0.12;
  const upwardVelocity = [0, 0, 78], exitVelocity = [-2.6, 1.4, 1.5];
  const nearEnd = addVec(endLocal, [0.68, -0.55, -0.26]);
  const bendPoint = addVec(start, upwardVelocity, riseEnd - riseRamp / 2);
  const diagonalVelocity = nearEnd.map((end, index) => (end - bendPoint[index]! - upwardVelocity[index]! * turnDuration / 2 - exitVelocity[index]! * brakeDuration / 2) / (finish - begin - riseEnd - turnDuration / 2 - brakeDuration / 2));
  return [
    [beats.liftStart, start, [0, 0, 0]],
    [begin + riseRamp, addVec(start, upwardVelocity, riseRamp / 2), upwardVelocity],
    [begin + riseEnd, bendPoint, upwardVelocity],
    [begin + riseEnd + turnDuration, addVec(addVec(bendPoint, upwardVelocity, turnDuration / 2), diagonalVelocity, turnDuration / 2), diagonalVelocity],
    [finish - brakeDuration, addVec(addVec(nearEnd, exitVelocity, -brakeDuration / 2), diagonalVelocity, -brakeDuration / 2), diagonalVelocity],
    [finish, nearEnd, exitVelocity],
    [beats.endSec - 0.16, endLocal, [0, 0, 0]],
  ];
})();
const [yaBoLunPathFirst, yaBoLunPathSecond] = [pointTrack(yaBoLunPointsFirst), pointTrack([...yaBoLunPointsSecond, ...pullTrack.slice(1)])];
/** 她在第 2 幕的脚底（本地，幕内世界秒）；瞬移那一刻跳变 */
export const yaBoLunSecondLocal = (w: number): [number, number, number] => (w < beats.移 ? yaBoLunPathFirst(w) : yaBoLunPathSecond(w)) as [number, number, number];
/** 她第 2 幕开头之前（第 1 幕）站在现身点 */
export const yaBoLunAppearLocal = appearLocal;
