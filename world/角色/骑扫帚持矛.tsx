// 骑扫帚平端长矛：6-1-5～6-1-8 打 boss 共用的姿势和尺寸（在 骑扫帚.tsx 套件上加一把下界合金长矛）。
// 李樱上身前倾 40°（高速），右臂往前送、肘弯着把矛夹在右肋下平端（armR 55、肘 35），矛沿扫帚方向朝前。
// 手、矛尖在扫帚本地坐标里的位置是用 esbuild 跑套件的 liYingHand(liYingFinalPose(…)) 量出来的；改了姿势要重量（见文件末尾的 measure）。
import React from 'react';
import type { V3 } from '../../engine/model/parts.tsx';
import { SpearInHand, SPEAR } from '../物品/下界合金长矛.tsx';
import { broomMatrix, handAim, liYingFinalPose, liYingHand, type RideLiYing, toScene } from './骑扫帚.tsx';

export const SPEAR_RIDER = { lean: 40, poseOverride: { armR: 55, armRRoll: 0, elbowR: 35 } };
// 量出来的（扫帚本地坐标，格）：右手握持点、左手握持点
export const HAND_R: V3 = [0.352, 1.012, 0.261];
export const HAND_L: V3 = [-0.251, 0.695, 0.175];
// 握持点到矛尖：长矛 SPEAR.tip 格 × 玩家模型 0.9375 倍
export const SPEAR_TIP = SPEAR.tip * 0.9375;
export const TIP_LOCAL: V3 = [HAND_R[0], HAND_R[1] + SPEAR_TIP, HAND_R[2]];

// 李樱的套件参数：平端长矛；额外的姿态改动（左手扬起之类）从 extra 传
export const spearLiYing = (extra?: Partial<ReturnType<typeof liYingFinalPose>>, headRaise = 4): RideLiYing => ({
  lean: SPEAR_RIDER.lean,
  headRaise,
  poseOverride: (base) => ({ ...base, ...SPEAR_RIDER.poseOverride, ...(extra ?? {}) }),
  右手: (pose) => (
    <group quaternion={handAim(pose, [0, 1, 0])}>
      <SpearInHand />
    </group>
  ),
});

// 矛尖在场景里的位置
export const spearTipWorld = (pos: V3, yaw: number, pitch = 0, roll = 0) => toScene(broomMatrix(pos, yaw, pitch, roll), TIP_LOCAL);
// 给定矛尖要在的位置，反求扫帚杆中心
export const broomFromTip = (tip: V3, yaw: number, pitch = 0, roll = 0): V3 => {
  const tipOffset = toScene(broomMatrix([0, 0, 0], yaw, pitch, roll), TIP_LOCAL);
  return [tip[0] - tipOffset[0], tip[1] - tipOffset[1], tip[2] - tipOffset[2]];
};

// 核对用：按套件现在的实现重新量手的位置（和上面的常数应一致）
export const measure = () => {
  const pose = liYingFinalPose({ lean: SPEAR_RIDER.lean, poseOverride: SPEAR_RIDER.poseOverride });
  return { R: liYingHand(pose, 'R'), L: liYingHand(pose, 'L') };
};
