// 吐息类粒子（Goety 的 FrostParticle、DragonFlameParticle、FireParticle 的苍蝇）和撒法（IBreathingSpell 的 breathAttack、dragonBreathAttack）。
// 粒子.tsx 的 贴图粒子 走的是原版 Particle.tick；这几种在那之上每刻还给速度加一点随机抖动、换帧不按寿命比例，所以另写一份模拟。
// 出处 goety 2.5.60.6：FrostParticle、DragonFlameParticle、FireParticle、IBreathingSpell。
import React from 'react';
import type { Png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../接口.ts';
import { addVec, scaleVec, unitVec, mix } from './弹道.ts';
import { facePatch, QuadGroup, type QuadItem } from './面片.tsx';
import type { Blend } from './材质.ts';
import { mulberry32 } from '@engine/core/数学.ts';

export interface BreathParticleClass {
  readonly frame: readonly Png[];
  /** 整数年龄 → 第几帧 */
  readonly 帧号: (age: number) => number;
  /** lifetime（刻） */
  readonly 寿命: number;
  /** gravity（每刻竖直速度 −= 0.04 × 重力；−0.1 = 慢慢往上飘） */
  readonly 重力: number;
  /** 头一刻不算重力（苍蝇：重力是在第一次 tick 的末尾才设上的） */
  readonly firstTickNoGravity?: boolean;
  /** friction */
  readonly 摩擦: number;
  /** 每刻末给速度加的随机量：水平两个分量各 ±随机 × 横，竖直 +随机 × 竖 */
  readonly jitterHoriz: number;
  readonly jitterVert: number;
  /** 碰到这个高度就没（hasPhysics 且落地即 remove 的给） */
  readonly ground?: number;
  readonly blend?: Blend;
}

export interface BreathBirth {
  readonly 刻: number;
  readonly 位: Vec3;
  /** 格/刻，场景坐标 */
  readonly 速: Vec3;
  /** quadSize（半边长） */
  readonly radius: number;
  readonly seed: number;
}

/** 这一颗画在第几帧、它的面片 */
const breathQuad = (breathKind: BreathParticleClass, spawn: BreathBirth, tick: number): readonly [number, QuadItem] | null => {
  const age = tick - spawn.刻;
  if (age < 0 || age >= breathKind.寿命) return null;
  const r = mulberry32(spawn.seed);
  let p = spawn.位;
  let prevPos = p;
  let v = spawn.速;
  const n = Math.floor(age);
  for (let k = 0; k < n; k++) {
    prevPos = p;
    if (!(breathKind.firstTickNoGravity && k === 0)) v = [v[0], v[1], v[2] - 0.04 * breathKind.重力];
    p = addVec(p, v);
    if (breathKind.ground !== undefined && p[2] < breathKind.ground) return null;
    v = scaleVec(v, breathKind.摩擦);
    const randomSign = () => (r() < 0.5 ? 1 : -1);
    v = [v[0] + r() * breathKind.jitterHoriz * randomSign(), v[1] + r() * breathKind.jitterHoriz * randomSign(), v[2] + r() * breathKind.jitterVert];
  }
  // 游戏画的是上一刻到这一刻之间
  return [Math.min(breathKind.frame.length - 1, Math.max(0, breathKind.帧号(n))), facePatch(mix(prevPos, p, age - n), spawn.radius)];
};

export const BreathParticles: React.FC<{ type: BreathParticleClass; spawns: readonly BreathBirth[]; sec: number }> = ({ type: breathKind, spawns, sec: sec }) => {
  const byFrame: QuadItem[][] = breathKind.frame.map(() => []);
  for (const spawn of spawns) {
    const frameQuad = breathQuad(breathKind, spawn, sec * 20);
    if (frameQuad) byFrame[frameQuad[0]]!.push(frameQuad[1]);
  }
  // 同一张图在序列里出现几次的（如 frost 的 1～6 再倒回 1）也各占一批，批数固定
  return (
    <>
      {breathKind.frame.map((image, i) => (
        <QuadGroup key={i} image={image} items={byFrame[i]!} blend={breathKind.blend ?? '镂空'} />
      ))}
    </>
  );
};

/** SingleQuadParticle 的初始 quadSize：0.1 × (随机 × 0.5 + 0.5) × 2 */
export const initialRadius = (rand: number) => 0.1 * (rand * 0.5 + 0.5) * 2;

const gaussian = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/**
 * dragonBreathAttack：一刻撒 个数 颗。位置 = 口 ± 0.15（每个分量）；方向 = normalize(朝向 × 3 + 随机单位向量)，
 * 速率 = 基速 × (1 + 随机)，同一刻的几颗共用一个速率。（参数 angle 只进了随机向量归一化之前，不影响结果）
 */
export const scatterDragonBreath = (mouth: Vec3, dir: Vec3, sprayCount: number, baseSpeed: number, tick: number, seed: number): { 位: Vec3; 速: Vec3; seed: number }[] => {
  const r = mulberry32(seed * 7919 + tick * 31 + 1);
  const rate = baseSpeed + r() * baseSpeed;
  const unitDir = unitVec(dir);
  return Array.from({ length: sprayCount }, (_, i) => {
    const pos: Vec3 = [mouth[0] + r() * 0.3 - 0.15, mouth[1] + r() * 0.3 - 0.15, mouth[2] + r() * 0.3 - 0.15];
    const jitter = unitVec([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]);
    return { 位: pos, 速: scaleVec(unitVec(addVec(scaleVec(unitDir, 3), jitter)), rate), seed: seed * 104729 + tick * 64 + i };
  });
};

/**
 * breathAttack（spreadOut = true）：一刻撒 个数 颗。位置 = 口 + 高斯 ÷ 2（每个分量）；
 * 速度 = (朝向 + 高斯 × 0.0075 × 散) × 速率，散 = 散布 × (1 + 随机 ÷ 2)，速率 = 基速 × (1 + 随机)，每颗各抽。
 */
export const scatterBreath = (mouth: Vec3, dir: Vec3, sprayCount: number, baseSpeed: number, spread: number, tick: number, seed: number): { 位: Vec3; 速: Vec3; seed: number }[] => {
  const r = mulberry32(seed * 7919 + tick * 31 + 2);
  const unitDir = unitVec(dir);
  return Array.from({ length: sprayCount }, (_, i) => {
    const jitteredSpread = spread + r() * (spread / 2);
    const rate = baseSpeed + r() * baseSpeed;
    const speedVec = scaleVec([unitDir[0] + gaussian(r) * 0.0075 * jitteredSpread, unitDir[1] + gaussian(r) * 0.0075 * jitteredSpread, unitDir[2] + gaussian(r) * 0.0075 * jitteredSpread], rate);
    const pos: Vec3 = [mouth[0] + gaussian(r) / 2, mouth[1] + gaussian(r) / 2, mouth[2] + gaussian(r) / 2];
    return { 位: pos, 速: speedVec, seed: seed * 104729 + tick * 64 + i };
  });
};
