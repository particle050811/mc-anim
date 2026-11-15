// 从目标头顶的云里往下落的一群弹（纯）：箭雨、暴雪共用（流星雨的火球另算，见 meteor_shower.元.ts）。
// 游戏里：目标上方（最多 15 格）取一个中心，每颗生在 中心 + (±8, ±2, ±8) 的随机处，朝目标 shoot(速度 1.0 + 1.5 × 随机, 散布 20 + 随机 × 10)。
// Projectile.shoot 的散布：单位方向各分量加 triangle(0, 0.0172275 × 散布)，再乘速度。箭一类：阻力 0.99、重力 0.05，落地就没。
import { mulberry32 } from '@engine/core/数学.ts';
import type { Vec3 } from '../../接口.ts';
import { sub, scaleVec, unitVec, parabola, type Trajectory } from '../弹道.ts';
import { trajectoryGroundTick, aimPoint } from './共用.ts';

export const cloudHeight = 15;
export interface ArrowRainShot {
  launchTick: number;
  spawnPos: Vec3;
  trajectory: Trajectory;
  flightTick: number;
}

/** 每刻一颗，共 颗数 颗 */
export const arrowRain = (target: Vec3, particleCount: number, seed: number): ArrowRainShot[] => {
  const r = mulberry32(seed * 83 + 13);
  const uniformJitter = (a: number) => (r() * 2 - 1) * a;
  return Array.from({ length: particleCount }, (_, k) => {
    const spawnPos: Vec3 = [target[0] + uniformJitter(8), target[1] + uniformJitter(8), target[2] + cloudHeight + uniformJitter(2)];
    const dir = unitVec(sub(aimPoint(target), spawnPos));
    const spread = 0.0172275 * (20 + r() * 10);
    const dirJitter = () => spread * (r() - r());
    const speedVec = scaleVec(unitVec([dir[0] + dirJitter(), dir[1] + dirJitter(), dir[2] + dirJitter()]), 1.0 + 1.5 * r());
    const trajectory = parabola(spawnPos, speedVec, { drag: 0.99, 重力: 0.05 });
    return { launchTick: k, spawnPos, trajectory, flightTick: trajectoryGroundTick(trajectory, target[2], 200) ?? 200 };
  });
};
