// 扫帚每一刻的状态（位置、朝向、俯仰、横滚、速度），以及 6-1-9 脱手以后落到屋顶的抛物线。
import { combineRoll } from '@engine/flight/真实飞行.ts';
import type { V3 } from '@engine/model/parts.tsx';
import * as castleChoreo from '../../6-1-9/编排.ts';
import { routeLength, speedAt, routeDist, T_ARRIVE } from './航线.ts';
import { physicalTime } from './时钟.ts';
import { plannedBank, positionAt, tangentAt, steerBank } from './真实航迹.ts';
import { smoothstep01, deg } from '@engine/core/数学.ts';

// ---------- 扫帚 ----------
// 朝向（度，0 = 北，正 = 往左转）、俯仰（度，正 = 抬头），由偏移后的切线算；朝向连续（不跳 360）
const DS = 1;
const N_YAW = Math.ceil(routeLength / DS);
const YAW_T = new Float64Array(N_YAW + 1);
const PIT_T = new Float64Array(N_YAW + 1);
for (let i = 0; i <= N_YAW; i++) {
  const tangent = tangentAt(i * DS);
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

export type BroomState = { 位置: V3; facing: number; pitch: number; roll: number; 速度: number; s: number; T: number };
export const broom = (g: number): BroomState => {
  const physT = physicalTime(g);
  const dist = routeDist(physT);
  const pos = positionAt(dist);
  let pitch = broomPitchAt(dist);
  const curSpeed = dist >= routeLength ? 0 : speedAt(dist);
  // 降落：扫帚减着速斜着扎向屋顶，到脱手点（航线终点）收起扫帚，两人顺着冲劲加重力落到屋顶；这一截仍用本函数给两人一起走的坐标系（见 6-1-9/编排.ts）
  if (physT > T_ARRIVE) return afterRelease(physT - T_ARRIVE);
  return { 位置: pos, facing: yawAt(dist), pitch: pitch, roll: combineRoll(plannedBank(dist), steerBank(g)), 速度: curSpeed, s: dist, T: physT };
};
const roofZ = castleChoreo.castleOrigin[2] + castleChoreo.ROOF_Z;
// 脱手以后 τ 秒：从航线终点按 末速、末俯仰 出发的抛物线，落到 落地杆高 就停住（着地的缓冲交给成片）
const afterRelease = (τ: number): BroomState => {
  const endPos = positionAt(routeLength);
  const t = tangentAt(routeLength);
  const v0 = castleChoreo.endSpeed;
  const gravity = castleChoreo.dismount.gravity;
  const vz = v0 * t[2];
  const fallDur = landingDuration();
  const fallT = Math.min(τ, fallDur);
  const z = endPos[2] + vz * fallT - 0.5 * gravity * fallT * fallT;
  return {
    位置: [endPos[0] + v0 * t[0] * fallT, endPos[1] + v0 * t[1] * fallT, z],
    facing: yawAt(routeLength),
    pitch: castleChoreo.endPitch * (1 - smoothstep01(fallT / fallDur)),
    roll: 0,
    速度: τ < fallDur ? v0 : 0,
    s: routeLength,
    T: T_ARRIVE + τ,
  };
};
export const landingDuration = () => {
  const vz = castleChoreo.endSpeed * tangentAt(routeLength)[2];
  const gravity = castleChoreo.dismount.gravity;
  const dropHeight = positionAt(routeLength)[2] - roofZ - castleChoreo.dismount.landingStickHeight;
  return (vz + Math.sqrt(vz * vz + 2 * gravity * dropHeight)) / gravity;
};
