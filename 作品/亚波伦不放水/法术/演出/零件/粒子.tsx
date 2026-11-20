// 贴图粒子：模组自己的粒子类（TextureSheetParticle 的子类）通用模拟。物理照原版 Particle.tick（底座在 @库/特效/粒子面片.tsx），
// 每种粒子把自己构造函数、tick 里的常数填成一个 粒子类，再给一张出生表。
// 原版粒子（flame、smoke、poof、portal、witch、enchant、explosion、sonic_boom、splash、crimson_spore）库里已经照抄过，直接用下面转出口的 VanillaParticles。
// 画网格不画方片的粒子（环、球、带子：CircleExplode、Shockwave、SphereExplode、Smash、Wind、GatherTrail、SummonTrail、WaterTrail、WindBlow、AbsorbTrail）不走这里，各自照类写（带子用 束.tsx 的 带，贴地的环用 地面贴花）。
import React, { useContext } from 'react';
import type { Png } from '@engine/model/贴图.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { interpPathPos, particleInitVel, particlePath, ParticlePhysics } from '@库/特效/粒子面片.tsx';
import type { Vec3 } from '../接口.ts';
import { facePatch, nearFadeContext, QuadGroup, sequenceFrame, type QuadItem } from './面片.tsx';
import type { Blend, RgbColor } from './材质.ts';
import { mulberry32 } from '@engine/core/数学.ts';

import { VanillaParticles as LibraryVanillaParticles } from '@库/特效/原版粒子.tsx';
export { serverSendParticles, type ParticleSpawn } from '@库/特效/原版粒子.tsx';
/** 库里的原版粒子接上段开的近镜淡（面片.tsx）：第一人称受击时，法术炸在他身上的爆炸、烟不再放大成整屏色块（用户 11-20「不要挡住太多的画面」） */
export const VanillaParticles: React.FC<React.ComponentProps<typeof LibraryVanillaParticles>> = (props) => {
  const nearFade = useContext(nearFadeContext);
  return <LibraryVanillaParticles {...props} nearFade={props.nearFade ?? nearFade ?? undefined} />;
};
export { particleInitVel as vanillaParticleInitSpeed };

export interface ParticleClass {
  /** 贴图序列，顺序照粒子定义 json 的 textures */
  readonly frame: readonly Png[];
  /** 按年龄 = setSpriteFromAge（年龄 × 帧数 ÷ 寿命）；随机 = pickSprite（出生时随机挑一张不换） */
  readonly 选帧: '按年龄' | '随机';
  /** gravity（每刻 yd −= 0.04 × 重力；负的往上飘），默认 0 */
  readonly 重力?: number;
  /** friction，默认 0.98 */
  readonly 摩擦?: number;
  /** 碰地面的高度（hasPhysics 的粒子给）；不给 = 不碰 */
  readonly ground?: number;
  readonly blend?: Blend;
  readonly 色?: RgbColor;
  /** 透明度、大小随年龄变的（年龄 刻，带小数）；大小是乘在出生 半径 上的倍数（getQuadSize） */
  readonly opacity?: (age: number, lifetime: number) => number;
  readonly size?: (age: number, lifetime: number) => number;
}

export interface ParticleBirth {
  /** 出生的刻（和组件的 秒 × 20 同一个钟，可以带小数） */
  readonly 刻: number;
  readonly 位: Vec3;
  /** 构造函数算完之后的速度（格/刻，场景坐标）；要父类那套随机化的先过 原版粒子初速（它进出都是游戏坐标 [x, y 竖直, z 南]，换成场景是 [x, −z, y]） */
  readonly 速?: Vec3;
  /** lifetime（刻）：年龄到这个数的那一刻消失 */
  readonly 寿命: number;
  /** quadSize（半边长，格） */
  readonly radius: number;
  readonly seed?: number;
  readonly angleRad?: number;
  readonly 色?: RgbColor;
}

/** ServerLevel.sendParticles(类型, x,y,z, 数量, dx,dy,dz, 速度)：数量 > 0 时每颗 位置 = 中心 + 高斯 × 散布，速度 = 高斯 × 速度（场景坐标：散布第三个分量是竖直） */
export const scatterServer = (center: Vec3, count: number, spread: Vec3, speed: number, seed: number): { 位: Vec3; 速: Vec3 }[] => {
  const r = mulberry32(seed);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return Array.from({ length: count }, () => ({
    位: [center[0] + gaussian() * spread[0], center[1] + gaussian() * spread[1], center[2] + gaussian() * spread[2]] as const,
    速: [gaussian() * speed, gaussian() * speed, gaussian() * speed] as const,
  }));
};

/** 一颗粒子在某一刻的面片和它用的贴图；没出生或已经消失返回 null */
export const particleQuad = (particleType: ParticleClass, spawn: ParticleBirth, tick: number): readonly [Png, QuadItem] | null => {
  const age = tick - spawn.刻;
  if (age < 0 || age >= spawn.寿命) return null;
  const trail = particlePath([...spawn.位] as V3, [...(spawn.速 ?? [0, 0, 0])] as V3, Math.ceil(age) + 1, new ParticlePhysics(particleType.重力 ?? 0, particleType.摩擦 ?? 0.98, particleType.ground));
  // 游戏画的是上一刻到这一刻之间（interpPathPos 的 tau 从 1 起才开始动），年龄 0～1 之间粒子还在出生位置
  const pos = interpPathPos(trail, age);
  const image = particleType.选帧 === '随机' ? particleType.frame[Math.floor(mulberry32((spawn.seed ?? 0) ^ 0x5bd1e995)() * particleType.frame.length)]! : sequenceFrame(particleType.frame, (Math.floor(age) * particleType.frame.length) / spawn.寿命);
  return [image, facePatch(pos, spawn.radius * (particleType.size?.(age, spawn.寿命) ?? 1), spawn.色 ?? particleType.色, undefined, particleType.opacity?.(age, spawn.寿命) ?? 1, spawn.angleRad)];
};

/** 画一批同类粒子。秒 × 20 和出生的 刻 是同一个钟 */
export const TexturedParticles: React.FC<{ type: ParticleClass; spawns: readonly ParticleBirth[]; sec: number; depthWrite?: boolean }> = ({ type: particleType, spawns, sec: sec, depthWrite }) => {
  const byImage = new Map<Png, QuadItem[]>();
  for (const spawn of spawns) {
    const frameQuad = particleQuad(particleType, spawn, sec * 20);
    if (!frameQuad) continue;
    const [image, item] = frameQuad;
    if (!byImage.has(image)) byImage.set(image, []);
    byImage.get(image)!.push(item);
  }
  // 每张贴图一批，批数固定成帧数（没有粒子的批画 0 个），免得每帧批数变了重建
  return (
    <>
      {particleType.frame.map((image, i) => (
        <QuadGroup key={i} image={image} items={byImage.get(image) ?? []} blend={particleType.blend ?? '镂空'} depthWrite={depthWrite} />
      ))}
    </>
  );
};
