// 第 1、2 幕的走位和她的演出：第 1 幕他已经站在基座外，右键放环、退开拔剑、仪式里紧张地挪步，她现身就动（睁眼、抬头、转向他、甩杖）；
// 第 2 幕（用户 11-11 重排）：他拿断曜流光潜行挥剑冲两次（物品/断曜流光冲刺.ts，照游戏原样）——第一次她瞬移走；第二次她往上一拉，他从她脚底下冲过去，
// 她拉升的同时转身、伸杖指他、杖尖张盘（这一段画面慢放、镜头绕她转，在 段/2-开盘/画面.tsx），停在祭坛上空 悬停高、盘张开、杖指着他。
// 纯计算，时钟是「现身后几秒」（现身前是负的），第 4、5 幕接着用；第 2 幕里这个钟走世界秒（开盘时刻.ts 的 幕），慢放只换画面的钟。
// 导出名（史蒂夫位、亚波伦位、开盘轴、盘半径……）第 4、5 幕在用，别改名。第 2 幕末以后两人都停在末态；第 4、5 幕的钟按片秒减去慢放多出来的（开盘拍.ts 的 慢放多出），第 4 幕开头正好是 幕末，一帧接上（编排-齐放.test.ts 查）。
// 时刻、站位、她的姿势、他转身和看哪都是 Agent 取的，用户没看过。
import { lerp, lerpV, smoothstep01 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { STEVE, steveSize } from '@库/角色/史蒂夫.tsx';
import { definePerformance, transitionAt, type TiltSettings, type DragSettings, type PerformanceBar } from '../../角色/动作/亚波伦演出.ts';
import { swordMoveLength, type MoveName } from '../../角色/剑招.ts';
import type { RightHandItem, SteveState } from '../../角色/史蒂夫反应.ts';
import { defineWalk } from '../../角色/史蒂夫走位.ts';
import { defaultOpenClose } from '../../界面/分圈.ts';
import type { DiscPlacement } from '../../界面/杖尖盘位姿.ts';
import { wheelOuterRadius, type MultiRingParams } from '../../界面/多圈轮盘.tsx';
import type { Teleport } from '../../特效/瞬移烟.tsx';
import { realNetherScene } from '../../地点/真下界位置.ts';
import { footHeight } from './布局.ts';
import {
  firstElevationDeg,
  firstDir,
  secondElevationDeg,
  secondDir,
  steveFirstPath,
  steveSecondLocal,
  yaBoLunSecondLocal,
  yaBoLunAppearLocal,
  act,
  actEnd,
  actStart,
  yaBoLunChestHeight,
  hoverFirst,
  hoverSecond,
  beats,
  sinkDepth,
  sneakEyeHeight,
  standHeight as standHeight,
  act1,
  turnWindows,
} from './开盘时刻.ts';
import { act2EndWheelTick } from './开盘拍.ts';
import { pointTrack } from './轨迹.ts';
import timeline from './时间线.ts';

const events = timeline.events;
/** 场时间线的秒 → 现身后几秒 */
export const afterAppear = (sceneSec: number) => sceneSec - events.yaBoLunAppears.sec;
export { actStart, actEnd };
export { localGroundHeight, trappedLocal, hoverHeight } from './开盘时刻.ts';

if (Math.abs(steveSize(STEVE.scale).eyeCrouch - sneakEyeHeight) > 0.005) throw new Error('开盘时刻.ts 的 潜行眼高 和 库/角色/史蒂夫.tsx 的 eyeCrouch 对不上');

// 祭坛那一列中心的游戏坐标（布局.ts 的 祭坛）；本地 = 以它为原点的场景坐标（x 东、y 北）
const altarGame = { x: 898.5, z: -299.5 };
export const altarPoint = realNetherScene(altarGame.x, footHeight(altarGame.x, altarGame.z), altarGame.z);
/** 本地 (x, y, 高) → 场景坐标，高从祭坛那一层地面（游戏 y 50）算（真下界场景 是平移） */
const toAirPos = (p: readonly number[]): V3 => [altarPoint[0] + p[0]!, altarPoint[1] + p[1]!, altarPoint[2] + p[2]!];
const degPerRad = 180 / Math.PI;
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
/** 水平方向 → 朝向（度，0 朝北，逆时针为正） */
const facingAngle = (dx: number, dy: number) => Math.atan2(-dx, dy) * degPerRad;
/** 从 a 转到 b（度）走短的那边 */
const turnTo = (a: number, b: number, k: number) => lerp(a, a + wrap180(b - a), k);
const easeBetween = (t: number, a: number, b: number) => smoothstep01((t - a) / (b - a));

// ── 史蒂夫的位置 ──
const steveTrack = pointTrack(steveFirstPath);
const steveLocal = (t: number): readonly number[] => {
  if (t >= actStart) return steveSecondLocal(t - actStart);
  const [x, y] = steveTrack(t) as [number, number];
  return [x, y, standHeight(x, y)];
};
export const stevePos = (t: number): V3 => toAirPos(steveLocal(t));

// 第 2 幕他的几种状态（幕内世界秒）：潜行（断曜流光要潜行着挥）、激流姿势（冲出去以后横着转 15 刻）
/** 蹲着的几段 [起, 止)：按下潜行 → 冲（转的时候是激流姿势，不显潜行）→ 转完还按着 → 再冲 → 转完 → 起身松开 */
const crouchSegs = [
  [beats.sneakFirstSec, beats.dashFirstSec],
  [turnWindows[0]![1], beats.dashSecondSec],
  [turnWindows[1]![1], beats.standUp],
] as const;
/** 潜行 0～1：游戏里一刻切过去，这里用 1 刻（0.05 秒）过渡；冲出去那一下直接换成激流姿势 */
const sneakProgress = (w: number) => {
  for (const [a, b] of crouchSegs) {
    const extraSec = b === beats.standUp ? 0.05 : 0;
    if (w >= a && w < b + extraSec) return Math.min(1, (w - a) / 0.05, w < b ? 1 : 1 - (w - b) / 0.05);
  }
  return 0;
};
/** 激流：转了几刻、冲的仰角；转完 1 刻里从横着回到站着（游戏里一刻切过去，这里给 1 刻过渡） */
const surge = (w: number): { 刻: number; elevationDeg: number; weight: number } | undefined => {
  for (const [i, [a, b]] of turnWindows.entries()) {
    if (w < a || w >= b + 0.05) continue;
    return { 刻: (w - a) * 20, elevationDeg: i === 0 ? firstElevationDeg : secondElevationDeg, weight: w < b ? 1 : 1 - (w - b) / 0.05 };
  }
  return undefined;
};
const eyeHeightAt = (t: number) => {
  const s = steveSize(STEVE.scale);
  return t < actStart ? s.eye : s.eye + (s.eyeCrouch - s.eye) * sneakProgress(t - actStart);
};
/** 他眼睛（她的杖指着这里） */
export const steveEye = (t: number): V3 => {
  const p = stevePos(t);
  return [p[0], p[1], p[2] + eyeHeightAt(t)];
};

// ── 她 ──
/** 她瞬移的那一刻（编排的钟）：位 在这里跳变 */
export const teleportTick = act(beats.移);
/** 亚波伦的脚底：现身到第 2 幕开头站在祭坛上，之后照 开盘时刻.ts 飞，停在祭坛上空 悬停高（第 4 幕从这一点接） */
export const yaBoLunPos = (t: number): V3 => toAirPos(t < actStart ? yaBoLunAppearLocal : yaBoLunSecondLocal(t - actStart));
export const teleports: readonly Teleport[] = [{ start: act(beats.smokeStart), 移: teleportTick, 从: toAirPos(hoverFirst), dest: toAirPos(yaBoLunSecondLocal(beats.移)) }];
/** 她的头（史蒂夫盯着的地方） */
export const yaBoLunHead = (t: number): V3 => {
  const p = yaBoLunPos(t);
  return [p[0], p[1], p[2] + 1.5];
};
const yaBoLunChest = (t: number): V3 => {
  const p = yaBoLunPos(t);
  return [p[0], p[1], p[2] + 1.1];
};

// ── 他看哪、身子朝哪 ──
/** 第 1 幕：她的头往前 0.1 秒里平均一下（她动的时候他的头是跟过去的，不是一帧跳过去） */
const lookYaBoLun = (t: number): V3 => {
  const samples = [0, 0.02, 0.04, 0.06, 0.08, 0.1].map((d) => yaBoLunHead(t - d));
  return [0, 1, 2].map((j) => samples.reduce((sum, p) => sum + p[j]!, 0) / samples.length) as V3;
};
/** 她往下沉到的地方的胸口（本地）：他第二次冲瞄的是这里 */
const sinkPos = [hoverSecond[0], hoverSecond[1], sinkDepth + yaBoLunChestHeight] as const;
/** 冲的时候视线顺着冲的方向（游戏里冲的方向就是视线） */
const followDashLook = (t: number, i: 0 | 1): V3 => {
  const eye = steveEye(t);
  const [dir, pitch] = i === 0 ? [firstDir, firstElevationDeg] : [secondDir, secondElevationDeg];
  return [eye[0] + dir[0] * 10, eye[1] + dir[1] * 10, eye[2] + Math.tan(pitch / degPerRad) * 10];
};
/** 他看的点：第 2 幕冲之前盯着她胸口（瞄着冲）、冲的时候顺着冲的方向、转完回头找她，最后抬头看祭坛上空的她 */
export const steveLook = (t: number): V3 => {
  if (t < actStart) return lookYaBoLun(t);
  const w = t - actStart;
  if (w < beats.dashFirstSec) return lerpV(lookYaBoLun(t), yaBoLunChest(t), easeBetween(w, beats.sneakFirstSec - 0.1, beats.sneakFirstSec)) as V3;
  if (w < beats.lookBack[0]) return followDashLook(t, 0);
  // 回头找她、瞄着她往下沉到的地方（她往上一拉的时候他已经在蓄剑，视线不跟着往上）
  if (w < beats.dashSecondSec) return lerpV(followDashLook(t, 0), toAirPos(sinkPos), easeBetween(w, beats.lookBack[0], beats.lookBack[1])) as V3;
  if (w < turnWindows[1]![1]) return followDashLook(t, 1);
  return lerpV(followDashLook(t, 1), yaBoLunHead(t), easeBetween(w, turnWindows[1]![1], turnWindows[1]![1] + 0.15)) as V3;
};
/** 史蒂夫第 1 幕的位置、身子朝向、摆腿（从第 1 幕开头推起，那时面朝北）；第 2 幕的朝向另算（见 史蒂夫朝向） */
export const steveWalk = defineWalk({ 位: stevePos, 看: steveLook, start: afterAppear(events.开始.sec), initFacing: 0 });
const [firstDashFacing, secondDashFacing] = [facingAngle(firstDir[0], firstDir[1]), facingAngle(secondDir[0], secondDir[1])];
/** 第 2 幕末他面朝她（水平） */
const endFacing = (() => {
  const [p, q] = [stevePos(actEnd), yaBoLunPos(actEnd)];
  return facingAngle(q[0] - p[0], q[1] - p[1]);
})();
/** 身子朝向（度）：第 2 幕冲之前转向冲的方向、冲的时候就是冲的方向，转完蹲着一扭身对着她（她在他背后），第二次冲完站起来转过来对着祭坛上空的她 */
export const steveFacing = (t: number): number => {
  const walkFacing = steveWalk.在(t).facing;
  if (t < actStart) return walkFacing;
  const w = t - actStart;
  if (w < beats.dashFirstSec) return turnTo(walkFacing, firstDashFacing, easeBetween(w, beats.sneakFirstSec, beats.dashFirstSec - 0.04));
  if (w < beats.dashSecondSec) return turnTo(firstDashFacing, secondDashFacing, easeBetween(w, beats.lookBack[0], beats.lookBack[1]));
  return turnTo(secondDashFacing, endFacing, easeBetween(w, turnWindows[1]![1], turnWindows[1]![1] + 0.3));
};

// ── 他手里 ──
/** 他右手拿什么：环 → 放下后空手 → 光柱起来拔剑 */
export const steveRightHand = (t: number): RightHandItem => (t < act1.ringReleaseSec ? '环' : t < act1.drawSwordSec ? '空' : '剑');
/** 挥手的点击（编排的钟）、招、蓄几秒：右键放环那一下也是挥手；两次冲各是潜行着左键挥一下。
 *  第一次挥跳劈（接第 1 幕拔剑后一直摆着的跳劈架势，不换招）、第二次横斩，挥剑的样子是本片的剑招（角色/剑招.ts），不是原版挥手 */
const clicks: readonly { sec: number; move?: MoveName; windUpSec?: number }[] = [
  { sec: act1.ringReleaseSec },
  { sec: act(beats.dashFirstSec), move: '跳劈', windUpSec: beats.dashFirstSec - beats.sneakFirstSec },
  { sec: act(beats.dashSecondSec), move: '横斩', windUpSec: beats.dashSecondSec - beats.lookBack[0] },
];
const prevClick = (t: number) => {
  let nearestClick: (typeof clicks)[number] | undefined;
  for (const c of clicks) if (t >= c.sec) nearestClick = c;
  return nearestClick;
};
/** 距上一次点击几秒；还没点过 = undefined */
export const steveSwingSec = (t: number): number | undefined => {
  const c = prevClick(t);
  return c && t - c.sec;
};
/** 上一刀是哪一招 */
export const steveMove = (t: number): MoveName | undefined => prevClick(t)?.move;
const nextClick = (t: number) => clicks.find((c) => c.move && c.sec > t);
/** 下一刀（正在蓄的）是哪一招 */
export const steveChargeMove = (t: number): MoveName | undefined => nextClick(t)?.move;
/** 第 1 幕拔剑后摆的架势：举到跳劈蓄的 0.3（Agent 取的） */
const raiseStance = 0.3;
/** 举剑蓄力 0～1：每刀点下前 蓄 秒蓄满；第 1 幕拔剑后 0.1 秒起到第一刀前一直摆着架势 */
export const steveCharge = (t: number): number => {
  const upcoming = nextClick(t);
  if (!upcoming) return 0;
  const windUp = smoothstep01((t - (upcoming.sec - upcoming.windUpSec!)) / upcoming.windUpSec!);
  const bottomCharge = upcoming === clicks[1] ? raiseStance * smoothstep01((t - act1.drawSwordSec - 0.1) / 0.3) : 0;
  return Math.max(windUp, bottomCharge);
};

/** 第 1、2 幕他这一刻的状态（给 <反应史蒂夫>）。秒：两臂轻晃的钟（第 2 幕给世界秒，慢放里跟着慢） */
export const steveStateAt = (t: number, sec: number): SteveState => {
  const walkState = steveWalk.在(t);
  const inAct2 = t >= actStart;
  const activeSurge = inAct2 ? surge(t - actStart) : undefined;
  return {
    ...walkState,
    // 第 2 幕朝向另算；冲刺贴地、高低差只有几厘米，不让 定走位 认跳
    ...(inAct2 ? { facing: steveFacing(t), 跳: {} } : {}),
    看: steveLook(t),
    sec: sec,
    rightHand: steveRightHand(t),
    // 用户 11-10 定：高端局，史蒂夫不拿盾
    leftHand: '空',
    swingSec: steveSwingSec(t),
    move: steveMove(t),
    chargeMove: steveChargeMove(t),
    charge: steveCharge(t),
    ...(inAct2 ? { sneak: sneakProgress(t - actStart) } : {}),
    ...(activeSurge ? { surge: activeSurge } : {}),
  };
};

// ── 她的朝向、姿势 ──
const faceSteve = (t: number) => {
  const [p, q] = [yaBoLunPos(t), steveEye(t)];
  return facingAngle(q[0] - p[0], q[1] - p[1]);
};
/** 她第二次冲之前朝着他冲过来的那头；他从她脚底下穿过去以后转过身来对着他（这一转在慢放里） */
const secondDashPreFacing = (() => {
  const [p, q] = [yaBoLunSecondLocal(beats.dashSecondSec), steveSecondLocal(beats.dashSecondSec)];
  return facingAngle(q[0] - p[0], q[1] - p[1]);
})();
/** 转身：他从她脚底下穿过去那一下一甩身，0.15 秒（世界秒，3 刻；慢放里约 0.35 片秒）转过去对着他，往他那边转短的那头（顺时针）。
 *  八版是 0.46 秒慢慢转、2-03 的机位跟着她转身绕，看着没绕（用户 11-11「这个你压根儿没有环绕」）；改成先甩过去，镜头再在世界里绕（段/2-开盘/绕拍.ts）。Agent 取的 */
const turnWindow = [beats.dashSecondSec + 0.06, beats.dashSecondSec + 0.21] as const;
/** 她身子朝向（度）：现身时朝东、头垂着，1.0～1.35 秒转向他；之后一直朝着他，只有他从她脚底下穿过去那一下另算（不然一帧转 180 度） */
export const yaBoLunFacing = (t: number): number => {
  if (t < 1.0) return -95;
  if (t < 1.35) return turnTo(-95, faceSteve(t), smoothstep01((t - 1.0) / 0.35));
  const w = t - actStart;
  if (w < beats.dashSecondSec || w >= turnWindow[1]) return faceSteve(t);
  return turnTo(secondDashPreFacing, faceSteve(t), easeBetween(w, turnWindow[0], turnWindow[1]));
};
/** 现身后闭着眼，0.5～0.8 秒睁开 */
const eyeClose = (t: number) => (t < 0 ? 0 : 1 - smoothstep01((t - 0.5) / 0.3));
/** 身子跟着动作倾。六版 {2.2, 0.45, 30} 飞出来那一下前倾到 30 度，像趴着飞（用户 11-11「这样飞行姿势非常诡异」）；她「站着飞」（用户 11-10），这里只倾一点。Agent 取的 */
const lean: TiltSettings = { perSpeed: 0.35, perAccel: 0.012, limit: 12, 窗: 0.1 };

/** 她到举杖指着他为止的姿势轴（编排的钟）；后面的幕接着往下排（第 4 幕从最后的 指向 接着）。 */
export const openingTimeline: readonly PerformanceBar[] = [
  // 第 1 幕：低头闭眼 → 抬头 → 转向他、甩杖 → 站好
  { start: 0, pose: '低头' },
  { start: 0.85, dest: 1.2, pose: '站立' },
  { start: act1.staffFlick[0], dest: act1.staffFlick[1], pose: '甩杖' },
  { start: 1.75, dest: 2.05, pose: '站立' },
  // 第 2 幕：一蹬飞出来 → 飞 → 刹住一收、冒烟瞬移 → 出来飞一下 → 悬停 → 看他回头往下一沉 → 往上一拉 → 拉升里伸直手臂、杖指他 → 慢放过了收回 指向（第 4 幕从这里接）
  { start: act(beats.takeoff), dest: act(beats.takeoff + 0.05), pose: '起飞' },
  { start: act(beats.takeoff + 0.05), dest: act(beats.takeoff + 0.16), pose: '飞行' },
  { start: act(beats.smokeStart), dest: act(beats.smokeStart + 0.12), pose: '瞬移收' },
  { start: teleportTick, dest: act(beats.移 + 0.08), pose: '飞行' },
  { start: act(beats.移 + 0.16), dest: act(beats.移 + 0.4), pose: '悬停' },
  { start: act(beats.sinkSec), dest: act(beats.liftStart), pose: '起飞' },
  { start: act(beats.liftStart), dest: act(beats.liftStart + 0.08), pose: '升空' },
  { start: act(beats.staffExtend[0]), dest: act(beats.staffExtend[1]), pose: '升指' },
  { start: act(beats.finishStanceSec[0]), dest: act(beats.finishStanceSec[1]), pose: '指向' },
];
/** 袍摆、身后披风跟着飞拖（用户 11-11「飞行姿势很诡异」：八版衣服一动不动，像挂着的人偶）：27 格/秒往上蹿下摆往里收约 16 度、20 格/秒平飞往后拖约 12 度，
 *  刹住反着甩一下，飞得快时叠一点抖。第 2 幕末她停住了，这些都回到 0（第 4 幕不拖，一帧接上）。Agent 取的 */
const dragSettings: DragSettings = { perSpeed: 0.6, perAccel: 0.02, limit: 22, jitterPerSpeed: 0.2, shakeMax: 4, shakeFreq: 3, 窗: 0.1 };
export const perform = definePerformance({ timeline: openingTimeline, 位: yaBoLunPos, target: steveEye, yaw: yaBoLunFacing, lean, dragSettings, breakpoints: [teleportTick], eyeClose });

// ── 轮盘：第 2 幕拉升里从杖尖张开（用户 11-11「飞行的时候伸出法杖 圆环缓缓张开」），第 4、5 幕接着用 ──
/** 盘在世界里的半径（格）。用户 11-10 看了直径 12 格的说过大、「比人都大这么多」；缩到直径 4 格是 Agent 取的，用户没看过 */
export const wheelRadius = 2;
export const cellsPerPixel = wheelRadius / wheelOuterRadius({ 放: '有画面' });
export const wheelPlace = { facing: '垂直杖身', tipOffset: 0.1 } satisfies DiscPlacement;
/** 张盘的那一刻（编排的钟，世界秒）。张开照原版快慢（每圈 2.5 刻，界面/分圈.ts 的 默认开合），慢放里看着慢 */
export const openWheelTick = act(beats.openWheelSec);
/** 第 2 幕这一刻盘的参数（编排的钟）；张盘前 null。不亮格（选中在第 4 幕）。
 *  图标从盘心散出去（用户 11-11「应该是一开始都是从中心点蜷缩的 重叠的 移到正确的位置上」），只这里开；第 2 幕末盘早张满了，和第 4 幕第一帧画的一样 */
export const act2WheelParams = (t: number): MultiRingParams | null => {
  const tick = (Math.min(t, actEnd) - openWheelTick) * 20;
  return tick < 0 ? null : { 放: '有画面', 刻: tick, openClose: defaultOpenClose, exitIcon: '盘心移出' };
};

/** 第 2 幕末（第 4 幕的起点）：编排的钟到 幕末 以后两人都停在这里不动 */
export const act2End = {
  /** 编排的钟（世界秒）= 第 4 幕的 幕起（齐放拍.ts） */
  sec: actEnd,
  yaBoLunPos: yaBoLunPos(actEnd),
  yaBoLunFacing: yaBoLunFacing(actEnd),
  /** 姿势轴最后一条（杖指着他的 眼） */
  poseName: '指向' as const,
  stevePos: stevePos(actEnd),
  steveFacing: endFacing,
  disc: {
    /** 张开后第几刻（盘已经全开：3 圈 7.5 刻）；第 4 幕从这一刻接着转 */
    刻: act2EndWheelTick,
    openClose: defaultOpenClose,
    radius: wheelRadius,
    cellsPerPixel,
  },
};

// ── 给测试用的 ──
/** 每一下快动作：谁、什么、从几秒到几秒（编排的钟，世界秒；测试算峰值速度） */
export const actionTable: readonly { who: '史蒂夫' | '亚波伦'; name: string; start: number; end: number; slowMo?: boolean }[] = [
  { who: '史蒂夫', name: '第一次冲（断曜流光）', start: act(beats.dashFirstSec), end: act(beats.dashFirstSec + 0.6) },
  { who: '史蒂夫', name: '第二次冲（断曜流光）', start: act(beats.dashSecondSec), end: act(beats.dashSecondSec + 0.6), slowMo: true },
  { who: '亚波伦', name: '从祭坛飞出来', start: act(beats.takeoff), end: act(beats.arriveSec) },
  { who: '亚波伦', name: '往上一拉、飞到祭坛上空', start: act(beats.liftStart), end: act(beats.peakSec), slowMo: true },
];
/** 两人在第 1、2 幕里什么时候算「静止」：位置不动（速度低于 0.15 格/秒）且没在做动作（挥剑、姿势在过渡、转身、转激流）。给 编排-开盘.test.ts 报占比 */
export const stillCheck = {
  steve: (t: number) => {
    const [a, b] = [stevePos(t - 0.05), stevePos(t + 0.05)];
    const swingSec = steveSwingSec(t);
    const inSwing = swingSec !== undefined && swingSec < swordMoveLength;
    const turning = t >= actStart && (!!surge(t - actStart) || Math.abs(wrap180(steveFacing(t + 0.05) - steveFacing(t - 0.05))) / 0.1 > 5);
    return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.1 < 0.15 && !inSwing && !turning && Math.abs(steveCharge(t + 0.05) - steveCharge(t - 0.05)) < 0.002;
  },
  yaBoLun: (t: number) => {
    if (t < 0) return false; // 还没现身，不在场上
    const [a, b] = [yaBoLunPos(t - 0.05), yaBoLunPos(t + 0.05)];
    const inTransition = transitionAt(openingTimeline, t).比 < 1;
    const turning = Math.abs(wrap180(yaBoLunFacing(t + 0.05) - yaBoLunFacing(t - 0.05))) / 0.1 > 5;
    const eyeMoment = t >= 0 && t < 0.85;
    return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.1 < 0.15 && !inTransition && !turning && !eyeMoment;
  },
};
