// 7-1 黄叛和箭：照亮的火把箭、风矢（7-1-5、7-1-7 打在监守者身上的三支）的放、中时刻和路线，插在监守者身上的箭，弓前鼓风机虚影，黄叛的姿势。
// 黄叛每一箭都开鼓风机（用户 10-19 定：「怎么可能不开鼓风机就射箭？」），画法同 6-4-3a 风矢：弓前 0.3 格的鼓风机虚影 + 散花风道（../弓前风扇.tsx）。
import type { V3 } from '@engine/model/parts.tsx';
import { drawBowPose } from '../../../../角色/追兵.tsx';
import { pinToWardenBody, wardenBodyPinAt, type BodyPin, type WardenFrame } from '@库/生物/监守者.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { bowPointWorld, BOW_ARROW_TIP, bowTextureFor, type BowTexture } from '@库/物品/弓.tsx';
import { ARROW } from '@库/物品/箭.tsx';
import { nearYaw, yawTo } from '../../6-4-1/古城戏.ts';
import type { 弓前风扇 } from '../弓前风扇.tsx';
import * as geom from '../几何.ts';
import * as timeline from '../时间线.ts';
import { elevationDeg, lerp, lerpV, pulseWindow, pursuersAfter649, ss, yawFromTo } from './公用.ts';
import { airPose, breathe, crouch, crouchAmount, huangLeaps, huangStart, isAirborne, landT, leapTurnYaw, windArrowReleaseT } from './跳.ts';
import { wardenAt, wardenChestPos } from './监守者路.ts';
import { huangLeapList, huangPanPos, liuXinzhongPos } from './位置.ts';
import { hurtTs, wardenState } from './监守者.ts';
const huangHeight = 1.875;
// 风开多大（照 6-4-3 风矢的机制：箭穿过风扇被风道推，出风道的速度跟着风速走；风速 = 原版 AirFlowParticle 逐刻推 × 快放，见 ../../6-4-3/几何.ts）：
// - 满风（风矢）：同 6-4-3，满转 256、快放 880，箭出风道 1000 米/秒。
// - 小风（照亮用的火把箭）：转速开到四分之一（风道 2.2 格）、快放 132，箭约 150 米/秒，末端的风（165 米/秒）还比箭快；
//   这个速度扎进幽匿块地面就停住、按夸克火把箭立成火把，不会像风矢那样把方块打穿（6-4-3 挑飞击穿）。
export type 风档 = { 转速: number; 快放: number; 箭速: number };
const 满风: 风档 = { 转速: 256, 快放: 880, 箭速: 1000 };
const 小风: 风档 = { 转速: 64, 快放: 132, 箭速: 150 };
export type ArrowShot = { 放: number; 中: number; 起: V3; 落: V3; yaw: number; 俯仰: number; 火把?: V3; 风矢?: boolean; 风: 风档; drawSec: number; hitsWarden?: boolean };
type ArrowOpts = { 火把?: V3; 风矢?: boolean; drawSec: number; hitsWarden?: boolean };
// 放箭那一刻的拉弓姿势（空中放的按那一刻的空中位置）：箭从满弓的箭尖出
const makeArrow = (releaseT: number, aimTarget: V3 | ((t: number) => V3), opts: ArrowOpts): ArrowShot => {
  const wind = opts.风矢 ? 满风 : 小风;
  const speed = wind.箭速;
  const targetAt = typeof aimTarget === 'function' ? aimTarget : () => aimTarget;
  const feet = huangPanPos(releaseT);
  const eye: V3 = [feet[0], feet[1], feet[2] + 1.62];
  let hitPos = targetAt(releaseT + 0.1);
  const aimAt = (point: V3) => {
    const delta = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
    return { yaw: yawTo(delta[0], delta[1]), 俯仰: (Math.atan2(delta[2], Math.hypot(delta[0], delta[1])) * 180) / Math.PI };
  };
  let aim = aimAt(hitPos);
  let startPos = bowPointWorld(drawBowPose(feet, aim.yaw, 0, aim.俯仰, 1), huangHeight, 'L', BOW_ARROW_TIP.弓拉2);
  let hitT = releaseT + Math.hypot(hitPos[0] - startPos[0], hitPos[1] - startPos[1], hitPos[2] - startPos[2]) / speed;
  hitPos = targetAt(hitT);
  aim = aimAt(hitPos);
  startPos = bowPointWorld(drawBowPose(feet, aim.yaw, 0, aim.俯仰, 1), huangHeight, 'L', BOW_ARROW_TIP.弓拉2);
  hitT = releaseT + Math.hypot(hitPos[0] - startPos[0], hitPos[1] - startPos[1], hitPos[2] - startPos[2]) / speed;
  return { 放: releaseT, 中: hitT, 起: startPos, 落: hitPos, yaw: aim.yaw, 俯仰: aim.俯仰, 风: wind, ...opts };
};
// 按要钉中的时刻倒推放箭（先按飞 0.01 秒放一次，再把差的补上）
const arrowHittingAt = (hitT: number, aimTarget: (t: number) => V3, opts: ArrowOpts) => {
  const first = makeArrow(hitT - 0.01, aimTarget, opts);
  return makeArrow(first.放 + hitT - first.中, aimTarget, opts);
};
const cellCenter = (c: V3): V3 => [c[0] + 0.5, c[1] + 0.5, c[2] + 0.05];
// 照亮的火把箭（小风，飞行简化成直线）：落地立成火把
export const torchArrows: ArrowShot[] = [
  ...timeline.torchArrowReleaseTs.map((t, i) => makeArrow(t, cellCenter(geom.torchBlocks[i]), { 火把: geom.torchBlocks[i], drawSec: 0.6 })),
  makeArrow(timeline.woolTorchReleaseT, cellCenter(geom.torchBlocks[4]), { 火把: geom.torchBlocks[4], drawSec: timeline.woolTorchReleaseT - timeline.woolTorchDrawT }),
];
// 风矢（7-1-5）：H3 最高点放，千米每秒级，一闪就钉进后背（同 6-4-3、7-4-1 的 1000 米/秒）
export const windArrowShot = makeArrow(windArrowReleaseT, wardenChestPos, { 风矢: true, drawSec: windArrowReleaseT - timeline.windArrowDrawT, hitsWarden: true });
// 7-1-7：黄叛在黄叛高台上接着射，两支都是风矢、钉在监守者身上（钉中时刻见 时间线.ts 的 huangFollowArrowHitTs，伤害见 ./伤害.ts）。
//   两支放箭只隔 0.82 秒，拉弓 0.5 秒：前一支的鼓风机散了后一支的才化出来
export const huangFollowArrows: ArrowShot[] = timeline.huangFollowArrowHitTs.map((t) => arrowHittingAt(t, wardenChestPos, { 风矢: true, drawSec: 0.5, hitsWarden: true }));
export const allArrows = [...torchArrows, windArrowShot, ...huangFollowArrows];
hurtTs.push(windArrowShot.中, ...huangFollowArrows.map((a) => a.中));
// 钉在身子上（跟着 body 部件走路摆、攻击），按钉中那一刻的位置换到身子坐标里
export const wardenFrame = (t: number): WardenFrame => {
  const w = wardenState(t);
  return { p: w.p, entityYaw: w.entityYaw, 前倾: w.前倾, props: w };
};
const pins = new Map<ArrowShot, BodyPin>();
const pinOf = (arrow: ArrowShot) => {
  if (!pins.has(arrow)) {
    const shaftVec = [arrow.落[0] - arrow.起[0], arrow.落[1] - arrow.起[1], arrow.落[2] - arrow.起[2]];
    const shaftLen = Math.hypot(shaftVec[0], shaftVec[1], shaftVec[2]);
    const dir: V3 = [shaftVec[0] / shaftLen, shaftVec[1] / shaftLen, shaftVec[2] / shaftLen];
    // 箭尖扎到身子中轴前 0.075 格
    const back = 0.3;
    pins.set(arrow, pinToWardenBody(wardenFrame(arrow.中), [arrow.落[0] - dir[0] * back, arrow.落[1] - dir[1] * back, arrow.落[2] - dir[2] * back], dir));
  }
  return pins.get(arrow)!;
};
export const stuckArrows = (t: number) =>
  [windArrowShot, ...huangFollowArrows]
    .filter((a) => t >= a.中)
    .map((arrow) => ({ ...wardenBodyPinAt(wardenFrame(t), pinOf(arrow)), 火把箭: false }));
export const torches = (t: number) => torchArrows.filter((a) => a.火把 && t >= a.中).map((a) => ({ cell: a.火把!, 起: a.中 }));
export const flyingArrows = (t: number) =>
  allArrows
    .filter((a) => t >= a.放 && t < a.中)
    .map((arrow) => {
      const k = (t - arrow.放) / (arrow.中 - arrow.放);
      const shaftVec = [arrow.落[0] - arrow.起[0], arrow.落[1] - arrow.起[1], arrow.落[2] - arrow.起[2]];
      const shaftLen = Math.hypot(shaftVec[0], shaftVec[1], shaftVec[2]);
      return { p: lerpV(arrow.起, arrow.落, k), dir: [shaftVec[0] / shaftLen, shaftVec[1] / shaftLen, shaftVec[2] / shaftLen] as V3, 火把箭: !arrow.风矢 };
    });
// 鼓风机虚影（6-4-3a 同款，每一箭都有）：放箭前 拉弓时长（最多 0.6 秒）化出、放箭后 0.3 秒散，跟着弓走（空中放的人在飞，按这一刻和放箭那一刻的脚底差平移）
export const fanSize = 0.3;
export const fansAt = (t: number): 弓前风扇[] =>
  allArrows.flatMap((arrow, i) => {
    const lead = Math.min(0.6, arrow.drawSec);
    const visibility = ss((t - (arrow.放 - lead)) / 0.15) * (1 - ss((t - arrow.放) / 0.3));
    if (visibility <= 0) return [];
    const shaftVec = [arrow.落[0] - arrow.起[0], arrow.落[1] - arrow.起[1], arrow.落[2] - arrow.起[2]];
    const shaftLen = Math.hypot(shaftVec[0], shaftVec[1], shaftVec[2]);
    const dir: V3 = [shaftVec[0] / shaftLen, shaftVec[1] / shaftLen, shaftVec[2] / shaftLen];
    const feet = huangPanPos(t);
    const feetAtRelease = huangPanPos(arrow.放);
    const off = ARROW.tipAhead + 0.04 + fanSize / 2;
    const center: V3 = [0, 1, 2].map((k) => arrow.起[k] + feet[k] - feetAtRelease[k] + dir[k] * off) as V3;
    const mouth: V3 = [0, 1, 2].map((k) => center[k] + (dir[k] * fanSize) / 2) as V3;
    return [{ 显: visibility, dir, 心: center, 口: mouth, 边长: fanSize, 转起: arrow.放 - lead, 风停: arrow.放 + 0.25, 转速: arrow.风.转速, 快放: arrow.风.快放, 种子: arrow === windArrowShot ? 71 : 101 + 2 * i }];
  });

// 黄叛：拉弓的那几下朝着箭；空中照 空中 的腿；其余时候看监守者
export const huangPanState = (t: number): { pose: FigurePose; 弓: BowTexture } => {
  const nearestArrow = allArrows.reduce((b, c) => (Math.abs(c.放 - t) < Math.abs(b.放 - t) ? c : b));
  const drawSec = nearestArrow.drawSec;
  const draw = t < nearestArrow.放 ? ss((t - (nearestArrow.放 - drawSec)) / Math.min(0.45, drawSec * 0.7)) : 1 - ss((t - nearestArrow.放 - 0.3) / 0.4);
  const feet = huangPanPos(t);
  const wardenPos = wardenAt(t).p;
  let lookYaw = t < timeline.huangCrouchT ? huangStart.yaw ?? 0 : yawFromTo(feet, wardenPos);
  // 伸手拦刘心忠：朝着他
  if (t >= timeline.dontPanicT - 0.2 && t < timeline.dontPanicT + 1.1) lookYaw = yawFromTo(feet, liuXinzhongPos(t));
  const yaw = lerp(nearYaw(nearestArrow.yaw, lookYaw), nearestArrow.yaw, ss(draw * 3));
  let pose: FigurePose;
  const leap = huangLeapList.find((j) => isAirborne(j, t));
  if (draw > 0) {
    pose = drawBowPose(feet, yaw, 0, nearestArrow.俯仰 * ss(draw * 2), draw);
    if (leap) {
      const air = airPose(leap, t, yaw);
      pose = { ...pose, loc: air.loc, legR: air.legR, legL: air.legL, kneeR: air.kneeR, kneeL: air.kneeL, ground: 0, pitch: air.pitch * 0.4 };
    }
  } else if (leap) {
    pose = airPose(leap, t, leap.yaw);
  } else {
    // 起跳前先转向跳的方向、落地后慢慢转回来看监守者（同刘心忠）
    pose = { ...standPose(feet), yaw: nearYaw(0, leapTurnYaw(huangLeapList, t, lookYaw)), armL: 40, armLRoll: 4, armR: 22, armRRoll: 2 };
    if (t < timeline.huangCrouchT) pose = { ...pursuersAfter649(t).黄, yaw: leapTurnYaw([huangLeaps.H1], t, huangStart.yaw ?? 0), headYaw: Math.sin(Math.max(0, t - timeline.darknessT) * 2) * 20 * ss((t - timeline.darknessT) / 0.4) };
    pose.headPitch = -Math.max(-35, Math.min(20, elevationDeg([feet[0], feet[1], feet[2] + 1.6], [wardenPos[0], wardenPos[1], wardenPos[2] + 1.5]))) * 0.7;
    // 伸手拦刘心忠：右手往他那边一伸
    const reach = pulseWindow(t, timeline.dontPanicT, timeline.dontPanicT + 0.8, 0.2, 0.3);
    if (reach > 0) pose = { ...pose, armR: lerp(pose.armR, 95, reach), armRRoll: 0 };
    // 射火把照北墙根之前：四下张望
    const lookAround = pulseWindow(t, landT(huangLeaps.H3) + 0.1, timeline.woolTorchDrawT, 0.2, 0.2);
    pose.headYaw = 55 * Math.sin((t - landT(huangLeaps.H3)) * 4) * lookAround;
    if (t >= timeline.huangCrouchT) pose = breathe(pose, t, 0.45, 2.1); // 7-1-1 接 6-4-9 末帧那几秒不加
  }
  const rel = t >= nearestArrow.放 && draw > 0 ? ss((t - nearestArrow.放) / 0.12) : 0;
  if (rel > 0) pose = { ...pose, armR: pose.armR - 15 * rel, elbowR: 25 * rel };
  pose = crouch(pose, crouchAmount(huangLeapList, t));
  const drawing = t >= nearestArrow.放 - drawSec && t < nearestArrow.放;
  return { pose, 弓: bowTextureFor(drawing, (t - (nearestArrow.放 - drawSec)) / drawSec) };
};
// 黄叛末帧在黄叛高台（7-3 接着用）
export const huangPanFeet = geom.spots.huangPanPerch;
