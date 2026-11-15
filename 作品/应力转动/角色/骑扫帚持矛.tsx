// 骑扫帚平端长矛：6-1-5～6-1-8 打 boss 共用的姿势和尺寸（在 骑扫帚.tsx 套件上加一把下界合金长矛）。
// 李樱上身前倾 40°（高速），右臂往前送、肘弯着把矛夹在右肋下平端（armR 55、肘 35），矛沿扫帚方向朝前。
// 手、矛尖在扫帚本地坐标里的位置是用 esbuild 跑套件的 liYingHand(liYingFinalPose(…)) 量出来的；改了姿势要重量（见文件末尾的 measure）。
import type { V3 } from '@engine/model/parts.tsx';
import { SPEAR } from '@库/物品/下界合金长矛.tsx';
import { broomMatrix, toScene } from '@库/角色/骑扫帚.tsx';

export const SPEAR_RIDER = { lean: 40, poseOverride: { armR: 55, armRRoll: 0, elbowR: 35 } };
// 量出来的（扫帚本地坐标，格）：右手握持点、左手握持点
export const HAND_R: V3 = [0.352, 1.012, 0.261];
// 握持点到矛尖：长矛 SPEAR.tip 格 × 玩家模型 0.9375 倍
export const SPEAR_TIP = SPEAR.tip * 0.9375;
export const TIP_LOCAL: V3 = [HAND_R[0], HAND_R[1] + SPEAR_TIP, HAND_R[2]];

// 给定矛尖要在的位置，反求扫帚杆中心
export const broomFromTip = (tip: V3, yaw: number, pitch = 0, roll = 0): V3 => {
  const tipOffset = toScene(broomMatrix([0, 0, 0], yaw, pitch, roll), TIP_LOCAL);
  return [tip[0] - tipOffset[0], tip[1] - tipOffset[1], tip[2] - tipOffset[2]];
};

