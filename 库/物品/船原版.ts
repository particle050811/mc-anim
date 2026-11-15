// 原版木船（1.20.1）的数：划桨转角、速度、乘客座位、骑乘姿势。纯模块（编排、测试能直接引）；画法在 船.tsx，出处见那边文件头。
import type { V3 } from '../../engine/model/parts.tsx';
import type { PartPose } from '../../engine/model/实体模型.tsx';
import { rad } from '../../engine/core/数学.ts';

const clampedLerp = (a: number, b: number, t: number) => (t < 0 ? a : t > 1 ? b : a + (b - a) * t);

export const boatParams = {
  /** 每刻桨位加多少（弧度） */
  oarRadPerTick: Math.PI / 8,
  /** 船 y 在水面下多少格（floatBoat 的平衡点） */
  hullDraft: 0.04 / 0.06153846 * 0.5625,
  /** 船舱底板顶面、船舷顶离船底多高（格） */
  floorHeight: 3 / 16,
  gunwaleHeight: 9 / 16,
  /** 船舱（water_patch 那块）在船本地坐标里的范围（格，+Y 船头）：水面在这里挖掉 */
  cabinHole: { xFrac: 8 / 16, vertical: 14 / 16 },
  /** 乘客的 getMyRidingOffset：玩家 −0.35，别的实体 0 */
  passengerHeight: { player: -0.1 - 0.35, other: -0.1 },
  maxSpeed: 0.4,
} as const;

/** 原版划桨：rowingTime（f，弧度）→ 左右桨的 PartPose；null = 不划（getRowingTime 返回 0） */
export const oarPose = (f: number | null): Record<string, PartPose> => {
  const t = f ?? 0;
  const xRot = clampedLerp(-Math.PI / 3, -0.2617994, (Math.sin(-t) + 1) / 2);
  const yRot = clampedLerp(-Math.PI / 4, Math.PI / 4, (Math.sin(-t + 1) + 1) / 2);
  const zRot = 0.19634955;
  return { left_paddle: { rot: [xRot, yRot, zRot] }, right_paddle: { rot: [xRot, Math.PI - yRot, zRot] }, water_patch: { hide: true } };
};

/** 从静止起按着前进 刻 刻（可以带小数）以后的速度（格/刻）和走过的路（格） */
export const rowingStroke = (tick: number) => {
  if (tick <= 0) return { 速度: 0, 路: 0 };
  const k = Math.pow(0.9, tick);
  return { 速度: boatParams.maxSpeed * (1 - k), 路: boatParams.maxSpeed * (tick - 9 * (1 - k)) };
};

/** 第 序 个乘客（0 = 驾船的）在船本地坐标里的位置（+Y 船头）和身子相对船头的转角（度，正 = 往左）。动物满员时侧坐，朝哪边由 动物朝左 选（原版按实体 id 单双） */
export const boatSeat = (seatIndex: 0 | 1, o: { passengerCount: 1 | 2; isAnimal?: boolean; isPlayer?: boolean; animalFacesLeft?: boolean }): { 位: V3; 转: number } => {
  let forward = 0;
  if (o.passengerCount > 1) forward = (seatIndex === 0 ? 0.2 : -0.6) + (o.isAnimal ? 0.2 : 0);
  const height = o.isPlayer ? boatParams.passengerHeight.player : boatParams.passengerHeight.other;
  const yawDeg = o.isAnimal && o.passengerCount === 2 ? (o.animalFacesLeft ? 90 : -90) : 0;
  return { 位: [0, forward, height], 转: yawDeg };
};

/** 船本地坐标 → 场景坐标 */
export const boatToWorld = (loc: V3, yaw: number, p: V3): V3 => {
  const a = rad(yaw);
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [loc[0] + c * p[0] - s * p[1], loc[1] + s * p[0] + c * p[1], loc[2] + p[2]];
};

/** 原版玩家骑乘的姿势（HumanoidModel.setupAnim 的 riding）：两腿 xRot −81°、yRot ±18°、zRot ±4.5°，两臂 xRot 再加 −36°。给 stevePose 的结果叠上 */
export const ridingLimbs = <P extends { armR: number; armL: number }>(p: P) => ({
  ...p,
  armR: p.armR + 36,
  armL: p.armL + 36,
  legR: 81,
  legL: 81,
  legRYaw: 18,
  legLYaw: 18,
  legRRoll: -4.5,
  legLRoll: -4.5,
});
