// 方块碎屑：原版 ParticleTypes.BLOCK（TerrainParticle，1.20.1）。法术砸地、破土时溅的那把小方片。
// TerrainParticle：重力 1、摩擦 0.98、碰地停住；半边长 0.05～0.1 格；寿命 4 ÷ (随机 × 0.9 + 0.1) 刻；颜色 × 0.6；贴图取方块贴图里随机 1/4 见方的一块。
// 速度：传进来的 (xa, ya, za) 过父类 Particle 构造函数的随机化（原版粒子初速）。sendParticles 数量给 0 的写法，速度 = 给的方向 × speed，调用处自己乘好。
// 方块：游戏里取脚下那格的方块。片子的场地是下界，默认下界岩；核对段的灰地面不是方块，也用它。
import React from 'react';
import { png, type Png } from '@engine/model/贴图.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { interpPathPos, particleInitVel, particlePath, ParticlePhysics } from '@库/特效/粒子面片.tsx';
import type { Vec3 } from '../接口.ts';
import { facePatch, QuadGroup, type QuadItem } from './面片.tsx';
import netherrackPng from 'asset:贴图/方块/下界岩';
import { mulberry32 } from '@engine/core/数学.ts';

export const defaultGroundBlockPng: Png = png(netherrackPng);

export interface DebrisBirth {
  readonly 刻: number;
  readonly 位: Vec3;
  /** addParticle 的 xa、ya、za（场景坐标，格/刻）；不给 = 0 */
  readonly 速?: Vec3;
  readonly seed: number;
}

/** ServerParticleUtil.circularParticles：圆面积 π r² 颗（向上取整），均匀撒在半径 r 的圆里 */
export const scatterInCircle = (center: Vec3, radius: number, tick: number, seed: number): DebrisBirth[] => {
  const r = mulberry32(seed);
  const n = Math.ceil(Math.PI * radius * radius);
  return Array.from({ length: n }, (_, i) => {
    const angle = r() * Math.PI * 2;
    const randDistance = Math.sqrt(r()) * radius;
    return { 刻: tick, 位: [center[0] + Math.cos(angle) * randDistance, center[1] + Math.sin(angle) * randDistance, center[2]] as const, seed: seed * 31 + i };
  });
};

/** sendParticles(BLOCK, 中心, 数量, dx, dy, dz, speed)：位置 = 中心 + 高斯 × 散布，速度 = 高斯 × speed（散布第三个分量是竖直） */
export const scatterDebris = (center: Vec3, count: number, spread: Vec3, speed: number, tick: number, seed: number): DebrisBirth[] => {
  const r = mulberry32(seed);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return Array.from({ length: count }, (_, i) => ({
    刻: tick,
    位: [center[0] + gaussian() * spread[0], center[1] + gaussian() * spread[1], center[2] + gaussian() * spread[2]] as const,
    速: [gaussian() * speed, gaussian() * speed, gaussian() * speed] as const,
    seed: seed * 131 + i,
  }));
};

const debrisColor = [0.6, 0.6, 0.6] as const;

export const BlockDebris: React.FC<{ spawns: readonly DebrisBirth[]; sec: number; image?: Png; ground?: number }> = ({ spawns, sec: sec, image: image = defaultGroundBlockPng, ground }) => {
  const tick = sec * 20;
  const items: QuadItem[] = [];
  for (const spawn of spawns) {
    const age = tick - spawn.刻;
    if (age < 0) continue;
    const r = mulberry32(spawn.seed * 2654435761 + 11);
    const lifetime = Math.floor(4 / (r() * 0.9 + 0.1));
    if (age >= lifetime) continue;
    const speedVec = spawn.速 ?? [0, 0, 0];
    const v = particleInitVel(r, speedVec[0], speedVec[2], -speedVec[1]);
    const halfSize = 0.05 * (1 + r());
    const [u0, v0] = [(r() * 3) / 4, (r() * 3) / 4];
    const trail = particlePath([...spawn.位] as V3, [v[0], -v[2], v[1]], Math.ceil(age) + 1, new ParticlePhysics(1, 0.98, ground));
    items.push(facePatch(interpPathPos(trail, age), halfSize, debrisColor, [u0, v0, u0 + 0.25, v0 + 0.25]));
  }
  return <QuadGroup image={image} items={items} blend="镂空" />;
};
