// 甲组各法术共用的小工具（纯，.元.ts 也引）。坐标是场景坐标（Z 朝上）。
import type { Vec3 } from '../../接口.ts';
import { hitTick, throwTo, parabola, mix, vecLength, type Trajectory } from '../弹道.ts';

/** 打史蒂夫的哪：胸口（脚底上 0.9 格），同样板 灵魂束 */
export const aimPoint = (target: Vec3): Vec3 => [target[0], target[1], target[2] + 0.9];

/** 第一次落到 地 这个高度的刻（带小数）；上限刻内没落返回 null */
export const trajectoryGroundTick = (trajectory: Trajectory, groundZ: number, maxTick = 400): number | null => {
  for (let n = 0; n < maxTick; n++) {
    const [a, b] = [trajectory(n)[2], trajectory(n + 1)[2]];
    if (b <= groundZ && a > groundZ) return n + (a - groundZ) / (a - b);
    if (a <= groundZ) return n;
  }
  return null;
};

/** 弹什么时候没：碰到史蒂夫（离瞄点 半径 以内）或落地，取先到的；都没有取 上限刻 */
export const endTick = (trajectory: Trajectory, target: Vec3, radius = 0.5, maxTick = 400): number => Math.min(hitTick(trajectory, aimPoint(target), radius, maxTick) ?? maxTick, trajectoryGroundTick(trajectory, target[2], maxTick) ?? maxTick);

/** 带小数的刻的位置（同 弹道位置，这里给终点用） */
export const trajectoryAt = (trajectory: Trajectory, tick: number): Vec3 => {
  const n = Math.max(0, Math.floor(tick));
  return mix(trajectory(n), trajectory(n + 1), Math.max(0, tick) - n);
};

export const gaussian = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r() * 0.999999)) * Math.cos(2 * Math.PI * r());

/** ProjectileUtil.rotateTowardsMovement 的角（度）：yaw = atan2(vz, vx) + 90，pitch = atan2(水平, vy) − 90（游戏坐标：vy 竖直，vz = −场景 y） */
export const yawPitch = (dir: Vec3): { yaw: number; pitch: number } => ({
  yaw: (Math.atan2(-dir[1], dir[0]) * 180) / Math.PI + 90,
  pitch: (Math.atan2(Math.hypot(dir[0], dir[1]), dir[2]) * 180) / Math.PI - 90,
});

/** 整数刻 a ≤ n < b（b 取到当前刻为止，免得给还没出生的粒子建表） */
export const eachTick = (a: number, b: number): number[] => Array.from({ length: Math.max(0, Math.ceil(b) - Math.ceil(a)) }, (_, i) => Math.ceil(a) + i);

export const hexColor = (hex: number): readonly [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** Projectile.updateRotation 的角（度）：yaw = atan2(vx, vz)，pitch = atan2(vy, 水平)（箭、投掷物的渲染器用） */
export const arrowYawPitch = (dir: Vec3): { yaw: number; pitch: number } => {
  const [vx, vy, vz] = [dir[0], dir[2], -dir[1]];
  return { yaw: (Math.atan2(vx, vz) * 180) / Math.PI, pitch: (Math.atan2(vy, Math.hypot(vx, vz)) * 180) / Math.PI };
};

/**
 * 抛射物（箭、投掷物）朝 瞄 打：游戏里是照视线方向以 速率 出手、靠玩家自己抬枪口；片里要打中，
 * 这里挑最少的飞行刻数，让正好落在 瞄 上的初速不超过 速率（比 速率 慢一点点，方向略抬）。返回弹道和到 瞄 的刻。
 */
export const launchTrajectory = (startPos: Vec3, aim: Vec3, rate: number, opts: { drag?: number; 重力?: number } = {}): { trajectory: Trajectory; arriveTick: number } => {
  // 飞得越久要的初速越小（再久就成了高抛）：取平射那一支里第一个不超过 速率 的刻数
  let best = { n: 200 };
  for (let n = 1; n <= 200; n++) {
    if (vecLength(throwTo(startPos, aim, n, opts)) <= rate) {
      best = { n };
      break;
    }
  }
  return { trajectory: parabola(startPos, throwTo(startPos, aim, best.n, opts), opts), arriveTick: best.n };
};
