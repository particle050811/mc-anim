// 扫帚每帧的状态（位置、朝向、俯仰、横滚、速度），以及 6-1-9 脱手以后落到屋顶的抛物线。
import { combineRoll } from '@engine/flight/真实飞行.ts';
import type { V3 } from '@engine/model/parts.tsx';
import * as castleChoreo from '../../6-1-9/编排.ts';
import { ss, deg } from './输入表.ts';
import { 路线长, 速度, 路程, T_ARRIVE } from './航线.ts';
import { 物理时间 } from './时钟.ts';
import { plannedBank, 位置, 切线, 操纵内倾 } from './真实航迹.ts';

// ---------- 扫帚 ----------
// 朝向（度，0 = 北，正 = 往左转）、俯仰（度，正 = 抬头），由偏移后的切线算；朝向连续（不跳 360）
const DS = 1;
const N_YAW = Math.ceil(路线长 / DS);
const YAW_T = new Float64Array(N_YAW + 1);
const PIT_T = new Float64Array(N_YAW + 1);
for (let i = 0; i <= N_YAW; i++) {
  const tangent = 切线(i * DS);
  let y = deg(Math.atan2(-tangent[0], tangent[1]));
  if (i > 0) y += 360 * Math.round((YAW_T[i - 1] - y) / 360);
  YAW_T[i] = y;
  PIT_T[i] = deg(Math.atan2(tangent[2], Math.hypot(tangent[0], tangent[1])));
}
const lookupByDist = (t: Float64Array) => (dist: number) => {
  const x = Math.min(Math.max(dist / DS, 0), N_YAW);
  const i = Math.min(Math.floor(x), N_YAW - 1);
  return t[i] + (t[i + 1] - t[i]) * (x - i);
};
const yawAt = lookupByDist(YAW_T);
const broomPitchAt = lookupByDist(PIT_T);

export type 扫帚状态 = { 位置: V3; 朝向: number; 俯仰: number; 横滚: number; 速度: number; s: number; T: number };
export const 扫帚 = (frame: number): 扫帚状态 => {
  const physT = 物理时间(frame);
  const dist = 路程(physT);
  const pos = 位置(dist);
  let pitch = broomPitchAt(dist);
  const curSpeed = dist >= 路线长 ? 0 : 速度(dist);
  // 降落：扫帚减着速斜着扎向屋顶，到脱手点（航线终点）收起扫帚，两人顺着冲劲加重力落到屋顶；这一截仍用本函数给两人一起走的坐标系（见 6-1-9/编排.ts）
  if (physT > T_ARRIVE) return afterRelease(physT - T_ARRIVE, frame);
  return { 位置: pos, 朝向: yawAt(dist), 俯仰: pitch, 横滚: combineRoll(plannedBank(dist), 操纵内倾(frame)), 速度: curSpeed, s: dist, T: physT };
};
const roofZ = castleChoreo.castleOrigin[2] + castleChoreo.ROOF_Z;
// 脱手以后 τ 秒：从航线终点按 末速、末俯仰 出发的抛物线，落到 落地杆高 就停住（着地的缓冲交给成片）
const afterRelease = (τ: number, frame: number): 扫帚状态 => {
  const endPos = 位置(路线长);
  const t = 切线(路线长);
  const v0 = castleChoreo.endSpeed;
  const gravity = castleChoreo.dismount.gravity;
  const vz = v0 * t[2];
  const fallDur = 落地时长();
  const fallT = Math.min(τ, fallDur);
  const z = endPos[2] + vz * fallT - 0.5 * gravity * fallT * fallT;
  return {
    位置: [endPos[0] + v0 * t[0] * fallT, endPos[1] + v0 * t[1] * fallT, z],
    朝向: yawAt(路线长),
    俯仰: castleChoreo.endPitch * (1 - ss(fallT / fallDur)),
    横滚: 0,
    速度: τ < fallDur ? v0 : 0,
    s: 路线长,
    T: T_ARRIVE + τ,
  };
};
export const 落地时长 = () => {
  const vz = castleChoreo.endSpeed * 切线(路线长)[2];
  const gravity = castleChoreo.dismount.gravity;
  const dropHeight = 位置(路线长)[2] - roofZ - castleChoreo.dismount.landingStickHeight;
  return (vz + Math.sqrt(vz * vz + 2 * gravity * dropHeight)) / gravity;
};
