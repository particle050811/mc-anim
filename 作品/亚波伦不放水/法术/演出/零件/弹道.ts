// 弹道（纯数学，场景坐标 Z 朝上，速度 格/刻）：照原版各类弹射物的 tick() 一刻一刻走，再在两刻之间插值（游戏画的是上一刻和这一刻之间）。
// 出处：原版 1.20.1 AbstractHurtingProjectile.tick、ThrowableProjectile.tick、AbstractArrow.tick。
import { lerpV } from '@engine/core/数学.ts';
import type { Vec3 } from '../接口.ts';

export const addVec = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scaleVec = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const vecLength = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const unitVec = (a: Vec3): Vec3 => {
  const l = vecLength(a);
  return l > 0 ? scaleVec(a, 1 / l) : [0, 0, 0];
};
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => lerpV(a, b, t) as unknown as Vec3;

/** 一条弹道：第 n 刻末的位置（n 是整数，0 = 出生位置） */
export type Trajectory = (n: number) => Vec3;

/** 带小数的刻 → 位置：在 floor(刻) 和它下一刻之间线性插值（同游戏的 partialTicks）；刻 < 0 取出生位置 */
export const trajectoryPos = (trajectory: Trajectory, tick: number): Vec3 => {
  if (tick <= 0) return trajectory(0);
  const n = Math.floor(tick);
  return mix(trajectory(n), trajectory(n + 1), tick - n);
};

/** 这一刻的飞行方向（单位向量），给模型朝向用 */
export const trajectoryDir = (trajectory: Trajectory, tick: number): Vec3 => {
  const n = Math.max(0, Math.floor(tick));
  return unitVec(sub(trajectory(n + 1), trajectory(n)));
};

const trace = (step: (prevState: { 位: Vec3; 速: Vec3 }) => { 位: Vec3; 速: Vec3 }, startState: { 位: Vec3; 速: Vec3 }): Trajectory => {
  const pointTable = [startState];
  return (n) => {
    const m = Math.max(0, Math.floor(n));
    while (pointTable.length <= m) pointTable.push(step(pointTable[pointTable.length - 1]!));
    return pointTable[m]!.位;
  };
};

/** 匀速直线：每刻走 速 */
export const straightLine = (startPos: Vec3, speedVec: Vec3): Trajectory => (n) => addVec(startPos, scaleVec(speedVec, Math.max(0, n)));

/**
 * 原版火球一类（AbstractHurtingProjectile）：出生时速度 0，每刻 位 += 速；速 = (速 + 加速) × 惯性。
 * 加速 = 朝向单位向量 × 0.1（构造函数里归一后乘 0.1）；惯性原版 0.95，Goety 的 SpellHurtingProjectile 是 0.82（稳态 0.456 格/刻）。
 */
export const fireballTrajectory = (startPos: Vec3, dir: Vec3, opts: { inertia?: number; accel?: number } = {}): Trajectory => {
  const inertia = opts.inertia ?? 0.95;
  const pushAccel = scaleVec(unitVec(dir), opts.accel ?? 0.1);
  return trace(({ 位: pos, 速: speedVec }) => ({ 位: addVec(pos, speedVec), 速: scaleVec(addVec(speedVec, pushAccel), inertia) }), { 位: startPos, 速: [0, 0, 0] });
};

/**
 * 抛物线（ThrowableProjectile、AbstractArrow）：每刻 位 += 速；速 ×= 阻力；速.z −= 重力。
 * 投掷物 阻力 0.99、重力 0.03；箭 阻力 0.99、重力 0.05；初速 = 方向 × shoot 的 velocity。
 */
export const parabola = (startPos: Vec3, initVel: Vec3, opts: { drag?: number; 重力?: number } = {}): Trajectory => {
  const drag = opts.drag ?? 0.99;
  const gravity = opts.重力 ?? 0.03;
  return trace(({ 位: pos, 速: speedVec }) => {
    const nextPos = addVec(pos, speedVec);
    const v = scaleVec(speedVec, drag);
    return { 位: nextPos, 速: [v[0], v[1], v[2] - gravity] };
  }, { 位: startPos, 速: initVel });
};

/** 让抛物线落在目标上的初速：给定飞几刻，反解（阻力、重力同 抛物线） */
export const throwTo = (startPos: Vec3, target: Vec3, flightTick: number, opts: { drag?: number; 重力?: number } = {}): Vec3 => {
  const drag = opts.drag ?? 0.99;
  const gravity = opts.重力 ?? 0.03;
  // 位(n) = 起 + 速0 × S(n) − 重力 × G(n)，S(n) = Σ 阻力^i，G(n) = Σ_{k<n} Σ_{i<k} 阻力^i
  let S = 0;
  let G = 0;
  let weight = 1;
  for (let k = 0; k < flightTick; k++) {
    G += S;
    S += weight;
    weight *= drag;
  }
  return [(target[0] - startPos[0]) / S, (target[1] - startPos[1]) / S, (target[2] - startPos[2] + gravity * G) / S];
};

/**
 * 追踪：每刻把速度方向往「指向目标」转一点，速率不变。转向 0～1：新方向 = normalize(旧方向 × (1 − 转向) + 指向 × 转向)。
 * 游戏里各追踪弹的写法不一样（潜影贝导弹、Goety 的 homing），用的时候照那个类的常数给。
 */
export const homing = (startPos: Vec3, initVel: Vec3, target: Vec3, steer: number): Trajectory => {
  const rate = vecLength(initVel);
  return trace(({ 位: pos, 速: speedVec }) => {
    const nextPos = addVec(pos, speedVec);
    const toward = unitVec(sub(target, nextPos));
    const dir = unitVec(addVec(scaleVec(unitVec(speedVec), 1 - steer), scaleVec(toward, steer)));
    return { 位: nextPos, 速: scaleVec(dir, rate) };
  }, { 位: startPos, 速: initVel });
};

/** 第一次进到离目标 半径 以内（或穿过去了）的刻，带小数；上限刻内没到返回 null */
export const hitTick = (trajectory: Trajectory, target: Vec3, radius: number, maxTick = 400): number | null => {
  for (let n = 0; n < maxTick; n++) {
    const a = trajectory(n);
    const b = trajectory(n + 1);
    const ab = sub(b, a);
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    if (l2 === 0) continue;
    const ao = sub(target, a);
    const t = Math.min(1, Math.max(0, (ao[0] * ab[0] + ao[1] * ab[1] + ao[2] * ab[2]) / l2));
    if (vecLength(sub(mix(a, b, t), target)) <= radius) {
      // 线段上离目标正好 半径 的入点
      const perpDist = vecLength(sub(mix(a, b, (ao[0] * ab[0] + ao[1] * ab[1] + ao[2] * ab[2]) / l2), target));
      const entryOffset = Math.sqrt(Math.max(0, radius ** 2 - perpDist ** 2)) / Math.sqrt(l2);
      return n + Math.max(0, (ao[0] * ab[0] + ao[1] * ab[1] + ao[2] * ab[2]) / l2 - entryOffset);
    }
  }
  return null;
};

/** 方向 → 游戏的 yaw、pitch（度）。场景 → MC：x 东同向，MC 的 z（南）= −y，MC 的 y = z。照 Entity 的约定：yaw 0 朝南（+z），pitch 正 = 朝下 */
export const facingAngle = (dir: Vec3): { yaw: number; pitch: number } => {
  const [dx, dy, dz] = [dir[0], dir[2], -dir[1]];
  return { yaw: (Math.atan2(-dx, dz) * 180) / Math.PI, pitch: (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI };
};
