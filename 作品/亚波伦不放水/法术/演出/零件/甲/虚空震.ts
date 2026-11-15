// 虚空震弹（Goety 的 VoidShock）的运动（纯）：星陨、虚空闪共用。
// 生出来先悬着（有信号点的先飘到信号点，速度每刻衰减），到 锁刻 时锁定目标，之后以 1 格/刻（power = 方向 × 5 × 0.2）直线冲过去，碰到就爆。
import type { Vec3 } from '../../接口.ts';
import { sub, addVec, scaleVec, unitVec, vecLength, mix } from '../弹道.ts';
import { aimPoint } from './共用.ts';

export interface VoidShock {
  /** 出手后第几刻生出来 */
  launchTick: number;
  spawnPos: Vec3;
  /** 悬停的地方（没有信号点的就是 生位） */
  hoverPos: Vec3;
  /** 生出来后第几刻锁定目标（initTime） */
  lockTick: number;
}

/** 生出来后 t 刻在哪；锁定后朝史蒂夫胸口冲 */
export const voidShockPos = (tremor: VoidShock, target: Vec3, t: number): Vec3 => {
  // 飘向信号点：游戏里速度每刻连乘衰减，这里用每刻走剩下路程的 15% 近似
  const hoverAt = (k: number) => mix(tremor.hoverPos, tremor.spawnPos, 0.85 ** k);
  if (t <= tremor.lockTick) return hoverAt(Math.max(0, t));
  const startPos = hoverAt(tremor.lockTick);
  return addVec(startPos, scaleVec(unitVec(sub(aimPoint(target), startPos)), t - tremor.lockTick));
};
/** 生出来后第几刻撞上（离胸口 0.5 格） */
export const voidShockHitTick = (tremor: VoidShock, target: Vec3): number => tremor.lockTick + Math.max(0, vecLength(sub(aimPoint(target), voidShockPos(tremor, target, tremor.lockTick))) - 0.5);
