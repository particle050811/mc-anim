// 原版火球一类（AbstractHurtingProjectile）的弹道表（纯）：火球术、熔岩炸弹、轰击、流星雨共用。
// 配下界魔杖（NetherStaff）多放 2 颗：起点的 x、z 各加一个高斯（σ = 1 格），方向和中间那颗一样（平行飞，不朝目标收拢）。
import { mulberry32 } from '@engine/core/数学.ts';
import type { Vec3 } from '../../接口.ts';
import { sub, fireballTrajectory, type Trajectory } from '../弹道.ts';
import { endTick, aimPoint, gaussian } from './共用.ts';

export interface Fireball {
  /** 出手后第几刻生出来 */
  launchTick: number;
  trajectory: Trajectory;
  /** 生出来后飞几刻没（碰到人或落地） */
  flightTick: number;
}

/** 一发：中间一颗朝史蒂夫胸口，带 多颗 时两边各一颗（偏移用 种子） */
export const fireballShot = (startPos: Vec3, target: Vec3, launchTick: number, opts: { inertia?: number; count?: number; 种子?: number; hitRadius?: number } = {}): Fireball[] => {
  const dir = sub(aimPoint(target), startPos);
  const r = mulberry32((opts.种子 ?? 0) * 31 + 7);
  return Array.from({ length: 1 + (opts.count ?? 0) }, (_, i) => {
    const spawnPoint: Vec3 = i === 0 ? startPos : [startPos[0] + gaussian(r), startPos[1] + gaussian(r), startPos[2]];
    const trajectory = fireballTrajectory(spawnPoint, dir, { inertia: opts.inertia ?? 0.95 });
    return { launchTick, trajectory, flightTick: endTick(trajectory, target, opts.hitRadius ?? 0.5) };
  });
};
