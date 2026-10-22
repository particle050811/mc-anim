// 7-1 刘心忠每一刻的姿势：施法、闪避、喘气张望、甩护盾、召马上马。
import type { V3 } from '@engine/model/parts.tsx';
import { ridePose } from '../../../../角色/追兵.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { nearYaw } from '../../6-4-1/古城戏.ts';
import { leapFeetAt, type 跳 } from '../../布局.ts';
import * as timeline from '../时间线.ts';
import { elevationDeg, FPS, lerp, pulseWindow, pursuersAfter649, ss, yawFromTo } from './公用.ts';
import { airPose, breathe, crouch, crouchAmount, isAirborne, landT, leapTurnYaw, liuLeaps, liuStart, takeoffT } from './跳.ts';
import { wardenAt } from './监守者路.ts';
import { horseSpawnPos, horseState, huangPanPos, liuLeapList, liuXinzhongPos, wallLandT } from './位置.ts';
const liuFacingYaw = (t: number, feet: V3): number => {
  const wardenPos = wardenAt(t).p;
  return yawFromTo(feet, wardenPos);
};
// 召恼鬼：举杖（地上蹲着蹬地、半空里都举着），恼鬼冲出去那一下往前一指，再放下。返回 [举, 指]
const summonVexArm = (t: number): [number, number] => {
  const raise = ss((t - timeline.raiseStaffT) / 0.3) * (1 - ss((t - timeline.vexChargeT) / 0.2));
  const point = pulseWindow(t, timeline.vexChargeT, timeline.vexChargeT + 0.8, 0.15, 0.4);
  return [raise, point];
};
const withSummonArm = (pose: FigurePose, t: number): FigurePose => {
  const [raise, point] = summonVexArm(t);
  if (raise + point <= 0) return pose;
  const armR = lerp(lerp(pose.armR ?? 0, 160, raise), 100, point * (1 - raise));
  return { ...pose, armR, armRRoll: lerp(pose.armRRoll ?? 0, 0, Math.max(raise, point)), headPitch: lerp(pose.headPitch ?? 0, 5, raise) };
};
export const liuXinzhongPose = (t: number): FigurePose => {
  const horse = horseState(t);
  if (horse && t >= timeline.mountT) {
    // 骑上马：杖横在身前，跳墙时伏低
    const lean = pulseWindow(t, timeline.horseJumpT - 0.05, wallLandT, 0.15, 0.25);
    return ridePose(horse, { pitch: -10 - 14 * lean, headPitch: 4 + 10 * lean, armR: 50 - 10 * lean });
  }
  for (const [leapName, leap] of Object.entries(liuLeaps) as [keyof typeof liuLeaps, 跳][]) {
    if (!isAirborne(leap, t)) continue;
    const progress = (t - takeoffT(leap)) / leap.T;
    if (leapName === 'J1') {
      // 背身蹬地，半空回身朝监守者，举杖施法
      const turnBack = ss((progress - 0.15) / 0.4);
      const yaw = lerp(leap.yaw, nearYaw(leap.yaw, liuFacingYaw(t, leapFeetAt(leap, t * FPS))), turnBack);
      return withSummonArm(airPose(leap, t, yaw), t);
    }
    if (leapName === '闪') {
      // 后跃：面朝监守者往后飞
      return airPose(leap, t, nearYaw(leap.yaw + 180, liuFacingYaw(t, leapFeetAt(leap, t * FPS))));
    }
    return airPose(leap, t, leap.yaw);
  }
  const feet = liuXinzhongPos(t);
  let pose: FigurePose;
  if (t < timeline.liuCrouchT) {
    // 7-1-1：接着 6-4-9 的姿势（顶着吼声压低、吼完起来），黑暗压下来，一缩、左右看；起跳前 0.45 秒开始转身（背身蹬地）
    const flinch = ss((t - timeline.darknessT) / 0.3) * (1 - ss((t - timeline.darknessT - 1.2) / 0.8));
    const glance = Math.sin(Math.max(0, t - timeline.darknessT) * 2.2) * 25 * ss((t - timeline.darknessT) / 0.5);
    const yaw = leapTurnYaw([liuLeaps.J1], t, liuStart.yaw ?? 0);
    const base = pursuersAfter649(t).刘;
    pose = withSummonArm({ ...base, yaw, squash: (base.squash ?? 1) * (1 - 0.04 * flinch), headYaw: glance, headPitch: base.headPitch * (1 - 0.6 * flinch) }, t);
  } else {
    // 站着：朝监守者（召马时朝北）；起跳前先转向跳的方向、落地后慢慢转回来（J1、闪避跳在空中已经回身朝着监守者）
    const landYawFor = (J: 跳) => (J === liuLeaps.J1 || J === liuLeaps.闪 ? liuFacingYaw(landT(J), J.p1) : J.yaw);
    let yaw = leapTurnYaw(liuLeapList, t, t < takeoffT(liuLeaps.J1) ? liuStart.yaw ?? 0 : liuFacingYaw(t, feet), landYawFor);
    if (t >= timeline.summonHorseT - 0.1 && t < timeline.mountT) yaw = lerp(nearYaw(0, yaw), 0, ss((t - timeline.summonHorseT + 0.1) / 0.25));
    pose = { ...standPose(feet), yaw, armR: 30, armRRoll: 4, armL: 10, armLRoll: 4 };
    pose = withSummonArm(pose, t);
    // 看着恼鬼一只只没了：「一百级的恼鬼……」往后一仰、杖垂下，到蹬地逃走为止（后半句落上墙脊才喊）
    const recoil = pulseWindow(t, timeline.impossibleT - 0.15, timeline.liuJ2TakeoffT, 0.2, 0.25);
    pose.pitch = (pose.pitch ?? 0) + 6 * recoil;
    pose.headPitch = (pose.headPitch ?? 0) + 8 * recoil;
    pose.armR = pose.armR - 18 * recoil;
    pose.armL = (pose.armL ?? 0) + 8 * recoil;
    // 墙脊上 / C2：往下看追过来的监守者
    const wardenPos = wardenAt(t).p;
    pose.headPitch = (pose.headPitch ?? 0) - Math.max(-30, Math.min(30, elevationDeg([feet[0], feet[1], feet[2] + 1.6], [wardenPos[0], wardenPos[1], wardenPos[2] + 1.5]))) * 0.6;
    // 平时也喘气、身子微微起伏（用户 10-13 嫌「站着别定格」）；跑过一阵以后（墙脊上、C2）喘得重
    const winded = t >= landT(liuLeaps.J2) ? 1 : 0.35;
    pose = breathe(pose, t, winded * (t >= landT(liuLeaps.J4) && t < timeline.liuDodgeT ? 0 : 1), 0.7);
    // C2：喘气（身子一起一伏），落地就转头听黄叛喊（监守者 0.75 秒就扑到，来不及张望）
    if (t >= landT(liuLeaps.J4) && t < timeline.liuDodgeT) {
      const pant = Math.sin((t - landT(liuLeaps.J4)) * 9) * 0.5 + 0.5;
      pose.squash = (pose.squash ?? 1) * (1 - 0.025 * pant);
      pose.pitch = (pose.pitch ?? 0) - 6;
      const huangPos = huangPanPos(t);
      const listen = pulseWindow(t, landT(liuLeaps.J4) + 0.1, timeline.liuDodgeT, 0.25, 0.12);
      pose.headYaw = listen * Math.max(-70, Math.min(70, nearYaw(0, yawFromTo(feet, huangPos) - yaw)));
      pose.headPitch = lerp(pose.headPitch ?? 0, 35, listen);
    }
    // 护盾：回身一推（杖往前平举）；召马：杖举高
    const push = pulseWindow(t, timeline.shieldT - 0.12, timeline.summonHorseT - 0.05, 0.1, 0.2);
    const summon = pulseWindow(t, timeline.summonHorseT, timeline.horseSpawnT + 0.1, 0.25, 0.2);
    pose.armR = lerp(lerp(pose.armR, 92, push), 150, summon);
    // 翻身上马：往马那边一蹿（0.3 秒）
    if (t >= timeline.horseSpawnT) {
      const k = ss((t - timeline.horseSpawnT) / (timeline.mountT - timeline.horseSpawnT));
      const mounted = ridePose({ p: horseSpawnPos, yaw: 0 });
      pose = { ...pose, loc: [lerp(feet[0], mounted.loc[0], k), lerp(feet[1], mounted.loc[1], k), lerp(feet[2], mounted.loc[2], k) + 0.6 * Math.sin(Math.PI * k)], legR: 40 * Math.sin(Math.PI * k), legL: -20 * k };
    }
  }
  return crouch(pose, crouchAmount(liuLeapList, t));
};
