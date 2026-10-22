// 7-1 二人的跳：每一跳的起落时刻，空中姿势、蓄力和落地缓冲、起跳前后的转身、站着喘气。
import type { V3 } from '@engine/model/parts.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { PUSH, flightPose, launchShape, nearYaw } from '../../6-4-1/古城戏.ts';
import { elite, eliteLeap, leapFeetAt, withHang, type 跳 } from '../../布局.ts';
import * as geom from '../几何.ts';
import * as timeline from '../时间线.ts';
import { FPS, lerp, ss } from './公用.ts';
// 顶点前后慢多少（`withHang`，用户 10-18 定每跳不一样）按起跳时刻和起点取，加跳、挪时刻都不用另配；只改沿弧的快慢，起落时刻、弧不变
export const leapAtSec = (p0: V3, p1: V3, apexHeight: number, t0: number): 跳 => withHang(eliteLeap(p0, p1, apexHeight, t0 * FPS), Math.round((t0 * FPS) / 5) + Math.round(p0[0]));
export const landT = (J: 跳) => J.f1 / FPS;
export const takeoffT = (J: 跳) => J.f0 / FPS;
export const isAirborne = (J: 跳, t: number) => t >= takeoffT(J) && t < landT(J);
export const liuStart = geom.pursuersStart.刘;
export const huangStart = geom.pursuersStart.黄;
export const liuLeaps = (() => {
  const J1 = leapAtSec(liuStart.loc as V3, geom.spots.hillTop, geom.leapApex.J1, timeline.liuTakeoffT);
  const J2 = leapAtSec(geom.spots.hillTop, geom.spots.eastWallRidge, geom.leapApex.J2, timeline.liuJ2TakeoffT);
  const J3 = leapAtSec(geom.spots.eastWallRidge, geom.spots.C1, geom.leapApex.J3, timeline.liuJ3TakeoffT);
  const J4 = leapAtSec(geom.spots.C1, geom.spots.C2, geom.leapApex.J4, landT(J3) + elite.landingSquatSec);
  const dodge = leapAtSec(geom.spots.C2, geom.spots.shieldPoint, geom.dodgeLeap.离地, timeline.liuDodgeT);
  return { J1, J2, J3, J4, 闪: dodge };
})();
export const huangLeaps = (() => {
  const H1 = leapAtSec(huangStart.loc as V3, geom.spots.huangPlatform, geom.leapApex.H1, timeline.huangTakeoffT);
  const H2 = leapAtSec(geom.spots.huangPlatform, geom.spots.southPlatformTop, geom.leapApex.H2, timeline.huangH2TakeoffT);
  const H3 = leapAtSec(geom.spots.southPlatformTop, geom.spots.huangPanPerch, geom.leapApex.H3, timeline.huangH3TakeoffT);
  return { H1, H2, H3 };
})();
// 风矢在 H3 的最高点放
export const windArrowReleaseT = takeoffT(huangLeaps.H3) + huangLeaps.H3.tUp;

// 空中的姿势：古城戏.ts 的 `flightPose`（6-4-5、6-4-6 共用的那一套，不垫羊毛）。yaw 可以和飞的方向不一样（回身、后跃）：
// 面朝的方向和飞的方向反着时（闪避跳往后跃）上身往后仰，不往监守者那边栽；离地后头 0.25 跳里才仰过去，接得上 `crouch` 蹬地时往前的那一下
export const airPose = (leap: 跳, t: number, yaw: number): FigurePose => {
  const pose = flightPose(leap, t * FPS, { place: false });
  const u = (t * FPS - leap.f0) / (leap.f1 - leap.f0);
  const backward = Math.max(0, -Math.cos(((yaw - leap.yaw) * Math.PI) / 180)) * ss(u / 0.25);
  return { ...pose, pitch: pose.pitch * (1 - 1.6 * backward), yaw };
};
// 地上那几帧怎么蹲（`crouchAmount` 算、`crouch` 叠到站姿上）：深 蹲的深浅（负 = 落地起身冲过头那一点），蹬 起跳最后 `PUSH` 帧往 `launchShape` 蹬直的程度，
// 栽 落地压到底时上身往前栽，头 低头晚一拍，手 两臂前后摆（度，正 = 往前）
export type 蹲 = { 深: number; 蹬: number; 栽: number; 头: number; 手: number };
const 不蹲: 蹲 = { 深: 0, 蹬: 0, 栽: 0, 头: 0, 手: 0 };
// 比 古城戏.ts 的 `crouchPose` 浅一些（刘心忠的袍子蹲深了下摆插进地面、杖横过来）；k < 0 只把身子往上挺、往后仰一点，腿不反折。
// 拉弓的时候（drawBowPose 带 armRYaw）手臂不跟着甩，免得箭歪；右手（刘心忠拿杖）只甩一半，免得杖往前横过来
export const crouch = (pose: FigurePose, amount: number | 蹲): FigurePose => {
  const c = typeof amount === 'number' ? { ...不蹲, 深: amount } : amount;
  const k = c.深;
  const armsFree = !pose.armRYaw && !pose.armLYaw;
  let p: FigurePose =
    k < 0
      ? { ...pose, squash: (pose.squash ?? 1) * (1 - 0.16 * k), pitch: (pose.pitch ?? 0) - 14 * k }
      : {
          ...pose,
          squash: (pose.squash ?? 1) * (1 - 0.08 * k),
          pitch: (pose.pitch ?? 0) - 16 * k,
          headPitch: (pose.headPitch ?? 0) + 10 * k,
          legR: (pose.legR ?? 0) + 55 * k,
          legL: (pose.legL ?? 0) + 50 * k,
          kneeR: (pose.kneeR ?? 0) + 95 * k,
          kneeL: (pose.kneeL ?? 0) + 88 * k,
        };
  p = { ...p, pitch: (p.pitch ?? 0) - 8 * c.栽, headPitch: (p.headPitch ?? 0) - 12 * c.头 };
  if (armsFree) p = { ...p, armR: (p.armR ?? 0) + 0.5 * c.手, armL: (p.armL ?? 0) + c.手 };
  if (c.蹬 > 0) {
    const L = launchShape(pose.loc as V3, pose.yaw ?? 0);
    const m = (a: number | undefined, b: number | undefined) => (a ?? 0) + ((b ?? 0) - (a ?? 0)) * c.蹬;
    p = {
      ...p,
      squash: m(p.squash ?? 1, 1),
      pitch: m(p.pitch, L.pitch),
      legR: m(p.legR, L.legR),
      kneeR: m(p.kneeR, L.kneeR),
      legL: m(p.legL, L.legL),
      kneeL: m(p.kneeL, L.kneeL),
      twist: m(p.twist, L.twist),
      ...(armsFree ? { armR: m(p.armR, (p.armR ?? 0) + 0.5 * (L.armR - (p.armR ?? 0))), armL: m(p.armL, L.armL), elbowL: m(p.elbowL, L.elbowL) } : {}),
    };
  }
  return p;
};
// 落地缓冲（思路同 古城戏.ts 的 `absorbPose`；用户 10-13 嫌「直着落地」太僵、10-18 要「蓄、放、停、收」）：3 帧压到最深（比蓄力还深）、上身往前栽、头晚一拍，
// 蹲住，再弹簧似的起身、冲过一点再落回，共 0.5 秒。只改姿势不改时刻：落地即走的下一跳仍在 落地 + `elite.落地卸力` 秒起跳。
const ABSORB_SEC = 3 / FPS;
const landingCushion = (sinceLand: number): 蹲 => {
  if (sinceLand < 0 || sinceLand >= 0.5) return 不蹲;
  const k = sinceLand / ABSORB_SEC;
  const bump = (x: number, a: number, b: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, (x - a) / (b - a))));
  let depth: number;
  if (k < 1) depth = lerp(0.75, 1.12, 1 - (1 - k) ** 2);
  else if (sinceLand < 0.2) depth = 1.12 - 0.08 * ((sinceLand - ABSORB_SEC) / (0.2 - ABSORB_SEC));
  else if (sinceLand < 0.4) depth = 1.04 - 1.12 * ss((sinceLand - 0.2) / 0.2); // 起身，冲到 −0.08
  else depth = -0.08 * (1 - ss((sinceLand - 0.4) / 0.1));
  return { 深: depth, 蹬: 0, 栽: bump(k, 0, 1.4), 头: bump(k, 0.2, 1.2), 手: 40 * (1 - ss(sinceLand / 0.35)) };
};
// 喘气、重心晃（用户 10-13 嫌「站着别定格」）：站着时身子一起一伏、头和手慢一点跟着
export const breathe = (pose: FigurePose, t: number, amount: number, phase: number): FigurePose => {
  if (amount <= 0) return pose;
  const bob = Math.sin(t * 5.2 + phase) * 0.5 + 0.5;
  const bobLag = Math.sin(t * 5.2 + phase - 0.6) * 0.5 + 0.5;
  return {
    ...pose,
    squash: (pose.squash ?? 1) * (1 - 0.018 * amount * bob),
    pitch: (pose.pitch ?? 0) - 3 * amount * bob,
    headPitch: (pose.headPitch ?? 0) - 2.5 * amount * bobLag,
    armR: (pose.armR ?? 0) + 3 * amount * bobLag,
    armL: (pose.armL ?? 0) + 4 * amount * bobLag,
  };
};
// 起跳前先转过去、落地后再慢慢转回来（免得起跳那一帧身子一下子扭向跳的方向）
export const leapTurnYaw = (leaps: 跳[], t: number, standYaw: number, landYaw: (leap: 跳) => number = (J) => J.yaw): number => {
  let y = standYaw;
  for (const leap of leaps) {
    const takeoffAt = takeoffT(leap);
    const landAt = landT(leap);
    if (t >= takeoffAt - 0.45 && t < takeoffAt) y = lerp(y, nearYaw(y, leap.yaw), ss((t - (takeoffAt - 0.45)) / 0.35));
    if (t >= landAt && t < landAt + 0.5) y = lerp(nearYaw(y, landYaw(leap)), y, ss((t - landAt) / 0.5));
  }
  return y;
};
// 一个人一串跳之间的位置：起跳前在 p0，落地后在 p1
export const leapChainPos = (startPos: V3, leaps: 跳[], t: number): V3 => {
  let pos = startPos;
  for (const leap of leaps) {
    if (t < takeoffT(leap)) return pos;
    if (t < landT(leap)) return leapFeetAt(leap, t * FPS);
    pos = leap.p1;
  }
  return pos;
};
// 起跳前 蓄力秒 蹲下、手往后甩，最后 `PUSH` 帧蹬直；落地后 0.5 秒缓冲。空中不蹲（连跳时上一跳的缓冲还没完就又起跳了）
export const crouchAmount = (leaps: 跳[], t: number): 蹲 => {
  if (leaps.some((leap) => isAirborne(leap, t))) return 不蹲;
  let k = 0;
  let push = 0;
  let arms = 0;
  for (const leap of leaps) {
    const takeoffAt = takeoffT(leap);
    const pushAt = takeoffAt - PUSH / FPS;
    const windAt = pushAt - elite.takeoffCrouchSec;
    if (t >= windAt && t < pushAt) {
      const x = (t - windAt) / elite.takeoffCrouchSec;
      k = Math.max(k, Math.sin((Math.PI / 2) * x));
      arms -= 50 * ss(x);
    }
    if (t >= pushAt && t < takeoffAt) {
      k = Math.max(k, 1);
      push = ss((t - pushAt) / (PUSH / FPS));
      arms -= 50;
    }
  }
  // 落地缓冲（最近一次落地；正的和蓄力取大，冲过头的负值只在没有蓄力时用）
  let cushion = 不蹲;
  for (const leap of leaps) if (t >= landT(leap) && t < landT(leap) + 0.5) cushion = landingCushion(t - landT(leap));
  const depth = cushion.深 < 0 && k === 0 ? cushion.深 : Math.max(k, cushion.深);
  return { 深: depth, 蹬: push, 栽: cushion.栽, 头: cushion.头, 手: arms + cushion.手 };
};
