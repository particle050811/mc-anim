// 贴图粒子：模组自己的粒子类（TextureSheetParticle 的子类）通用模拟。物理照原版 Particle.tick（底座在 @库/特效/粒子面片.tsx），
// 每种粒子把自己构造函数、tick 里的常数填成一个 粒子类，再给一张出生表。
// 原版粒子（flame、smoke、poof、portal、witch、enchant、explosion、sonic_boom、splash、crimson_spore）库里已经照抄过，直接用下面转出口的 VanillaParticles。
// 画网格不画方片的粒子（环、球、带子：CircleExplode、Shockwave、SphereExplode、Smash、Wind、GatherTrail、SummonTrail、WaterTrail、WindBlow、AbsorbTrail）不走这里，各自照类写（带子用 束.tsx 的 带，贴地的环用 地面贴花）。
import React from 'react';
import type { Png } from '@engine/model/贴图.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { rng } from '@engine/model/parts.tsx';
import { interpPathPos, particleInitVel, particlePath } from '@库/特效/粒子面片.tsx';
import type { 点 } from '../接口.ts';
import { 面片们, 序列帧, type 面片项 } from './面片.tsx';
import type { 混合, 色 } from './材质.ts';

export { deathPoof, serverSendParticles, VanillaParticles, type ParticleKind, type ParticleSpawn } from '@库/特效/原版粒子.tsx';
export { particleInitVel as 原版粒子初速 };

export interface 粒子类 {
  /** 贴图序列，顺序照粒子定义 json 的 textures */
  readonly 帧: readonly Png[];
  /** 按年龄 = setSpriteFromAge（年龄 × 帧数 ÷ 寿命）；随机 = pickSprite（出生时随机挑一张不换） */
  readonly 选帧: '按年龄' | '随机';
  /** gravity（每刻 yd −= 0.04 × 重力；负的往上飘），默认 0 */
  readonly 重力?: number;
  /** friction，默认 0.98 */
  readonly 摩擦?: number;
  /** 碰地面的高度（hasPhysics 的粒子给）；不给 = 不碰 */
  readonly 地面?: number;
  readonly 混合?: 混合;
  readonly 色?: 色;
  /** 透明度、大小随年龄变的（年龄 刻，带小数）；大小是乘在出生 半径 上的倍数（getQuadSize） */
  readonly 透明度?: (年龄: number, 寿命: number) => number;
  readonly 大小?: (年龄: number, 寿命: number) => number;
}

export interface 粒子出生 {
  /** 出生的刻（和组件的 秒 × 20 同一个钟，可以带小数） */
  readonly 刻: number;
  readonly 位: 点;
  /** 构造函数算完之后的速度（格/刻，场景坐标）；要父类那套随机化的先过 原版粒子初速（它进出都是游戏坐标 [x, y 竖直, z 南]，换成场景是 [x, −z, y]） */
  readonly 速?: 点;
  /** lifetime（刻）：年龄到这个数的那一刻消失 */
  readonly 寿命: number;
  /** quadSize（半边长，格） */
  readonly 半径: number;
  readonly 种子?: number;
  readonly 转角?: number;
  readonly 色?: 色;
}

/** ServerLevel.sendParticles(类型, x,y,z, 数量, dx,dy,dz, 速度)：数量 > 0 时每颗 位置 = 中心 + 高斯 × 散布，速度 = 高斯 × 速度（场景坐标：散布第三个分量是竖直） */
export const 服务端撒 = (中心: 点, 数量: number, 散布: 点, 速度: number, 种子: number): { 位: 点; 速: 点 }[] => {
  const r = rng(种子);
  const 高斯 = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return Array.from({ length: 数量 }, () => ({
    位: [中心[0] + 高斯() * 散布[0], 中心[1] + 高斯() * 散布[1], 中心[2] + 高斯() * 散布[2]] as const,
    速: [高斯() * 速度, 高斯() * 速度, 高斯() * 速度] as const,
  }));
};

/** 一颗粒子在某一刻的面片；没出生或已经消失返回 null */
export const 粒子面片 = (类: 粒子类, 生: 粒子出生, 刻: number): (面片项 & { 图: Png }) | null => {
  const 年龄 = 刻 - 生.刻;
  if (年龄 < 0 || 年龄 >= 生.寿命) return null;
  const 路 = particlePath([...生.位] as V3, [...(生.速 ?? [0, 0, 0])] as V3, Math.ceil(年龄) + 1, { gravity: 类.重力 ?? 0, friction: 类.摩擦 ?? 0.98, ground: 类.地面 });
  // 游戏画的是上一刻到这一刻之间（interpPathPos 的 tau 从 1 起才开始动），年龄 0～1 之间粒子还在出生位置
  const 位 = interpPathPos(路, 年龄);
  const 图 = 类.选帧 === '随机' ? 类.帧[Math.floor(rng((生.种子 ?? 0) ^ 0x5bd1e995)() * 类.帧.length)]! : 序列帧(类.帧, (Math.floor(年龄) * 类.帧.length) / 生.寿命);
  return { 图, 位, 半宽: 生.半径 * (类.大小?.(年龄, 生.寿命) ?? 1), 色: 生.色 ?? 类.色, 透明度: 类.透明度?.(年龄, 生.寿命) ?? 1, 转角: 生.转角 };
};

/** 画一批同类粒子。秒 × 20 和出生的 刻 是同一个钟 */
export const 贴图粒子: React.FC<{ 类: 粒子类; 出生们: readonly 粒子出生[]; 秒: number; 写深度?: boolean }> = ({ 类, 出生们, 秒, 写深度 }) => {
  const 按图 = new Map<Png, 面片项[]>();
  for (const 生 of 出生们) {
    const 片 = 粒子面片(类, 生, 秒 * 20);
    if (!片) continue;
    const { 图, ...项 } = 片;
    if (!按图.has(图)) 按图.set(图, []);
    按图.get(图)!.push(项);
  }
  // 每张贴图一批，批数固定成帧数（没有粒子的批画 0 个），免得每帧批数变了重建
  return (
    <>
      {类.帧.map((图, i) => (
        <面片们 key={i} 图={图} 项={按图.get(图) ?? []} 混合={类.混合 ?? '镂空'} 写深度={写深度} />
      ))}
    </>
  );
};
