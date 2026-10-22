// 扫帚（李樱跃出后的反冲）和后座驾驶扫帚的九胡。
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { broomMatrix, jiuhuRideBones, RIDE } from '@库/角色/骑扫帚.tsx';
import { JIUHU } from '@库/角色/九胡.tsx';
import { 刻, 起点, 思索拉高, yawVec } from '../时间线.ts';
import { ss, lerp } from './工具.ts';

const JH_PX = JIUHU.scale; // 九胡：一像素多少格（YSM 0.7/16）
const JH_HIP = 18.95; // 九胡腿的关节（RightLeg pivot）离脚底的像素，同 骑扫帚.tsx

// ---------- 扫帚 ----------
// 九胡驾驶，李樱跃出后扫帚不歪不掉（用户 10-05）。蹬出的反作用让扫帚头抬几度、后退半米，一秒多被稳回悬停。
// 思索以后（物理时间 > 0）高了 `思索拉高`，见 时间线.ts
const kickSettle = (u: number, T: number) => (u <= 0 ? 0 : (u / T) * Math.exp(1 - u / T)); // 冲一下再回落（u = T 时到顶 = 1）
export type BroomState = { pos: V3; yaw: number; pitch: number; roll: number };
export const broomState = (physSec: number): BroomState => {
  const startBroom = 起点.broom;
  const liftZ = startBroom.位置[2] + 思索拉高 * ss(physSec / 刻.standUp);
  const sinceLeap = physSec - 刻.leap;
  if (sinceLeap <= 0) return { pos: [startBroom.位置[0], startBroom.位置[1], liftZ], yaw: startBroom.朝向, pitch: startBroom.俯仰, roll: startBroom.横滚 };
  const { fwd } = yawVec(startBroom.朝向);
  const k = kickSettle(sinceLeap, 0.35);
  return {
    pos: [startBroom.位置[0] - fwd[0] * 0.4 * k, startBroom.位置[1] - fwd[1] * 0.4 * k, liftZ + 0.25 * k] as V3,
    yaw: startBroom.朝向,
    pitch: startBroom.俯仰 + 5 * k,
    roll: startBroom.横滚,
  };
};
export const broomMatrixAt = (physSec: number) => {
  const state = broomState(physSec);
  return broomMatrix(state.pos, state.yaw, state.pitch, state.roll);
};

// ---------- 九胡 ----------
// 一直跨坐在后座驾驶扫帚：起先抱着李樱的腰（6-2-6 末帧的姿势），他站起时松开、改扶扫帚杆；他跃出后她低头看着他扎下去
const JH0 = 起点.riders.九胡;
const rideBones = (physSec: number) => {
  const k = ss((physSec - 刻.releaseWaist) / 0.5);
  const watchHim = ss((physSec - 刻.leap - 0.1) / 0.5); // 跃出以后低头往下看
  return jiuhuRideBones({
    lean: lerp(JH0.lean, 8, k) + 10 * watchHim,
    hugWaist: lerp(JH0.hugWaist, 0, ss((physSec - 刻.releaseWaist) / 0.45)),
    headRaise: lerp(JH0.headRaise, -10, k) - 30 * watchHim,
    headTurn: lerp(JH0.headTurn ?? 0, 0, k),
    tailPhase: physSec * 2,
    风: 0,
  });
};
export type JiuhuState = { matrix: THREE.Matrix4; bones: Record<string, BonePose>; hip: V3; onBroom: boolean };
const JH_SEAT: V3 = [0, RIDE.back, RIDE.jiuhuHipZ];
export const jiuhu = (physSec: number): JiuhuState => {
  const matrix = broomMatrixAt(physSec).multiply(new THREE.Matrix4().makeTranslation(0, RIDE.back, RIDE.jiuhuHipZ - JH_HIP * JH_PX));
  const hip = new THREE.Vector3(...JH_SEAT).applyMatrix4(broomMatrixAt(physSec));
  return { matrix, bones: rideBones(physSec), hip: [hip.x, hip.y, hip.z], onBroom: true };
};
