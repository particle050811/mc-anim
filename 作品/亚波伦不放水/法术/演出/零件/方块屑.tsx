// 方块碎屑：原版 ParticleTypes.BLOCK（TerrainParticle，1.20.1）。法术砸地、破土时溅的那把小方片。
// TerrainParticle：重力 1、摩擦 0.98、碰地停住；半边长 0.05～0.1 格；寿命 4 ÷ (随机 × 0.9 + 0.1) 刻；颜色 × 0.6；贴图取方块贴图里随机 1/4 见方的一块。
// 速度：传进来的 (xa, ya, za) 过父类 Particle 构造函数的随机化（原版粒子初速）。sendParticles 数量给 0 的写法，速度 = 给的方向 × speed，调用处自己乘好。
// 方块：游戏里取脚下那格的方块。片子的场地是下界，默认下界岩；核对段的灰地面不是方块，也用它。
import React from 'react';
import { png, type Png } from '@engine/model/贴图.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { rng } from '@engine/model/parts.tsx';
import { interpPathPos, particleInitVel, particlePath } from '@库/特效/粒子面片.tsx';
import type { 点 } from '../接口.ts';
import { 面片们, type 面片项 } from './面片.tsx';
import 下界岩图 from 'asset:贴图/方块/下界岩';

export const 默认地面方块图: Png = png(下界岩图);

export interface 屑出生 {
  readonly 刻: number;
  readonly 位: 点;
  /** addParticle 的 xa、ya、za（场景坐标，格/刻）；不给 = 0 */
  readonly 速?: 点;
  readonly 种子: number;
}

/** ServerParticleUtil.circularParticles：圆面积 π r² 颗（向上取整），均匀撒在半径 r 的圆里 */
export const 圆里撒 = (中心: 点, 半径: number, 刻: number, 种子: number): 屑出生[] => {
  const r = rng(种子);
  const n = Math.ceil(Math.PI * 半径 * 半径);
  return Array.from({ length: n }, (_, i) => {
    const 角 = r() * Math.PI * 2;
    const 距 = Math.sqrt(r()) * 半径;
    return { 刻, 位: [中心[0] + Math.cos(角) * 距, 中心[1] + Math.sin(角) * 距, 中心[2]] as const, 种子: 种子 * 31 + i };
  });
};

/** sendParticles(BLOCK, 中心, 数量, dx, dy, dz, speed)：位置 = 中心 + 高斯 × 散布，速度 = 高斯 × speed（散布第三个分量是竖直） */
export const 屑撒 = (中心: 点, 数量: number, 散布: 点, 速度: number, 刻: number, 种子: number): 屑出生[] => {
  const r = rng(种子);
  const 高斯 = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return Array.from({ length: 数量 }, (_, i) => ({
    刻,
    位: [中心[0] + 高斯() * 散布[0], 中心[1] + 高斯() * 散布[1], 中心[2] + 高斯() * 散布[2]] as const,
    速: [高斯() * 速度, 高斯() * 速度, 高斯() * 速度] as const,
    种子: 种子 * 131 + i,
  }));
};

export const 方块屑: React.FC<{ 出生们: readonly 屑出生[]; 秒: number; 图?: Png; 地面?: number }> = ({ 出生们, 秒, 图 = 默认地面方块图, 地面 }) => {
  const 刻 = 秒 * 20;
  const 项: 面片项[] = [];
  for (const 生 of 出生们) {
    const 年龄 = 刻 - 生.刻;
    if (年龄 < 0) continue;
    const r = rng(生.种子 * 2654435761 + 11);
    const 寿命 = Math.floor(4 / (r() * 0.9 + 0.1));
    if (年龄 >= 寿命) continue;
    const 速 = 生.速 ?? [0, 0, 0];
    const v = particleInitVel(r, 速[0], 速[2], -速[1]);
    const 半 = 0.05 * (1 + r());
    const [u0, v0] = [(r() * 3) / 4, (r() * 3) / 4];
    const 路 = particlePath([...生.位] as V3, [v[0], -v[2], v[1]], Math.ceil(年龄) + 1, { gravity: 1, friction: 0.98, ground: 地面 });
    项.push({ 位: interpPathPos(路, 年龄), 半宽: 半, 色: [0.6, 0.6, 0.6], uv: [u0, v0, u0 + 0.25, v0 + 0.25] });
  }
  return <面片们 图={图} 项={项} 混合="镂空" />;
};
