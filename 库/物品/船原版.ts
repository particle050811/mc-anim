// 原版木船（1.20.1）的数：划桨转角、速度、乘客座位、骑乘姿势。纯模块（编排、测试能直接引）；画法在 船.tsx，出处见那边文件头。
import type { V3 } from '../../engine/model/parts.tsx';
import type { PartPose } from '../../engine/model/实体模型.tsx';

const rad = (d: number) => (d * Math.PI) / 180;
const clampedLerp = (a: number, b: number, t: number) => (t < 0 ? a : t > 1 ? b : a + (b - a) * t);

export const 船数 = {
  /** 每刻桨位加多少（弧度） */
  每刻桨转: Math.PI / 8,
  /** 船 y 在水面下多少格（floatBoat 的平衡点） */
  吃水: 0.04 / 0.06153846 * 0.5625,
  /** 船舱底板顶面、船舷顶离船底多高（格） */
  底板高: 3 / 16,
  舷高: 9 / 16,
  /** 船舱（water_patch 那块）在船本地坐标里的范围（格，+Y 船头）：水面在这里挖掉 */
  船舱: { 横: 8 / 16, 纵: 14 / 16 },
  /** 乘客的 getMyRidingOffset：玩家 −0.35，别的实体 0 */
  乘客高: { 玩家: -0.1 - 0.35, 其他: -0.1 },
  最快: 0.4,
} as const;

/** 原版划桨：rowingTime（f，弧度）→ 左右桨的 PartPose；null = 不划（getRowingTime 返回 0） */
export const 桨姿 = (f: number | null): Record<string, PartPose> => {
  const t = f ?? 0;
  const xRot = clampedLerp(-Math.PI / 3, -0.2617994, (Math.sin(-t) + 1) / 2);
  const yRot = clampedLerp(-Math.PI / 4, Math.PI / 4, (Math.sin(-t + 1) + 1) / 2);
  const zRot = 0.19634955;
  return { left_paddle: { rot: [xRot, yRot, zRot] }, right_paddle: { rot: [xRot, Math.PI - yRot, zRot] }, water_patch: { hide: true } };
};

/** 从静止起按着前进 刻 刻（可以带小数）以后的速度（格/刻）和走过的路（格） */
export const 划船行程 = (刻: number) => {
  if (刻 <= 0) return { 速度: 0, 路: 0 };
  const k = Math.pow(0.9, 刻);
  return { 速度: 船数.最快 * (1 - k), 路: 船数.最快 * (刻 - 9 * (1 - k)) };
};

/** 第 序 个乘客（0 = 驾船的）在船本地坐标里的位置（+Y 船头）和身子相对船头的转角（度，正 = 往左）。动物满员时侧坐，朝哪边由 动物朝左 选（原版按实体 id 单双） */
export const 船上座位 = (序: 0 | 1, o: { 乘客数: 1 | 2; 动物?: boolean; 玩家?: boolean; 动物朝左?: boolean }): { 位: V3; 转: number } => {
  let 前 = 0;
  if (o.乘客数 > 1) 前 = (序 === 0 ? 0.2 : -0.6) + (o.动物 ? 0.2 : 0);
  const 高 = o.玩家 ? 船数.乘客高.玩家 : 船数.乘客高.其他;
  const 转 = o.动物 && o.乘客数 === 2 ? (o.动物朝左 ? 90 : -90) : 0;
  return { 位: [0, 前, 高], 转 };
};

/** 船本地坐标 → 场景坐标 */
export const 船上 = (loc: V3, yaw: number, p: V3): V3 => {
  const a = rad(yaw);
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [loc[0] + c * p[0] - s * p[1], loc[1] + s * p[0] + c * p[1], loc[2] + p[2]];
};

/** 原版玩家骑乘的姿势（HumanoidModel.setupAnim 的 riding）：两腿 xRot −81°、yRot ±18°、zRot ±4.5°，两臂 xRot 再加 −36°。给 stevePose 的结果叠上 */
export const 骑乘腿臂 = <P extends { armR: number; armL: number }>(p: P) => ({
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
