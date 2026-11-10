// 吐息类粒子（Goety 的 FrostParticle、DragonFlameParticle、FireParticle 的苍蝇）和撒法（IBreathingSpell 的 breathAttack、dragonBreathAttack）。
// 粒子.tsx 的 贴图粒子 走的是原版 Particle.tick；这几种在那之上每刻还给速度加一点随机抖动、换帧不按寿命比例，所以另写一份模拟。
// 出处 goety 2.5.60.6：FrostParticle、DragonFlameParticle、FireParticle、IBreathingSpell。
import React from 'react';
import type { Png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import type { 点 } from '../接口.ts';
import { 加, 乘, 单位, 混 } from './弹道.ts';
import { 面片们, type 面片项 } from './面片.tsx';
import type { 混合 } from './材质.ts';

export interface 吐息粒子类 {
  readonly 帧: readonly Png[];
  /** 整数年龄 → 第几帧 */
  readonly 帧号: (年龄: number) => number;
  /** lifetime（刻） */
  readonly 寿命: number;
  /** gravity（每刻竖直速度 −= 0.04 × 重力；−0.1 = 慢慢往上飘） */
  readonly 重力: number;
  /** 头一刻不算重力（苍蝇：重力是在第一次 tick 的末尾才设上的） */
  readonly 首刻无重力?: boolean;
  /** friction */
  readonly 摩擦: number;
  /** 每刻末给速度加的随机量：水平两个分量各 ±随机 × 横，竖直 +随机 × 竖 */
  readonly 抖横: number;
  readonly 抖竖: number;
  /** 碰到这个高度就没（hasPhysics 且落地即 remove 的给） */
  readonly 地面?: number;
  readonly 混合?: 混合;
}

export interface 吐息出生 {
  readonly 刻: number;
  readonly 位: 点;
  /** 格/刻，场景坐标 */
  readonly 速: 点;
  /** quadSize（半边长） */
  readonly 半径: number;
  readonly 种子: number;
}

const 一颗 = (类: 吐息粒子类, 生: 吐息出生, 刻: number): (面片项 & { 帧: number }) | null => {
  const 年龄 = 刻 - 生.刻;
  if (年龄 < 0 || 年龄 >= 类.寿命) return null;
  const r = rng(生.种子);
  let p = 生.位;
  let 上 = p;
  let v = 生.速;
  const n = Math.floor(年龄);
  for (let k = 0; k < n; k++) {
    上 = p;
    if (!(类.首刻无重力 && k === 0)) v = [v[0], v[1], v[2] - 0.04 * 类.重力];
    p = 加(p, v);
    if (类.地面 !== undefined && p[2] < 类.地面) return null;
    v = 乘(v, 类.摩擦);
    const 号 = () => (r() < 0.5 ? 1 : -1);
    v = [v[0] + r() * 类.抖横 * 号(), v[1] + r() * 类.抖横 * 号(), v[2] + r() * 类.抖竖];
  }
  // 游戏画的是上一刻到这一刻之间
  return { 位: 混(上, p, 年龄 - n), 半宽: 生.半径, 帧: Math.min(类.帧.length - 1, Math.max(0, 类.帧号(n))) };
};

export const 吐息粒子: React.FC<{ 类: 吐息粒子类; 出生们: readonly 吐息出生[]; 秒: number }> = ({ 类, 出生们, 秒 }) => {
  const 按帧: 面片项[][] = 类.帧.map(() => []);
  for (const 生 of 出生们) {
    const 片 = 一颗(类, 生, 秒 * 20);
    if (片) 按帧[片.帧]!.push(片);
  }
  // 同一张图在序列里出现几次的（如 frost 的 1～6 再倒回 1）也各占一批，批数固定
  return (
    <>
      {类.帧.map((图, i) => (
        <面片们 key={i} 图={图} 项={按帧[i]!} 混合={类.混合 ?? '镂空'} />
      ))}
    </>
  );
};

/** SingleQuadParticle 的初始 quadSize：0.1 × (随机 × 0.5 + 0.5) × 2 */
export const 原始半径 = (随机: number) => 0.1 * (随机 * 0.5 + 0.5) * 2;

const 高斯 = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/**
 * dragonBreathAttack：一刻撒 个数 颗。位置 = 口 ± 0.15（每个分量）；方向 = normalize(朝向 × 3 + 随机单位向量)，
 * 速率 = 基速 × (1 + 随机)，同一刻的几颗共用一个速率。（参数 angle 只进了随机向量归一化之前，不影响结果）
 */
export const 龙息撒 = (口: 点, 朝: 点, 个数: number, 基速: number, 刻: number, 种子: number): { 位: 点; 速: 点; 种子: number }[] => {
  const r = rng(种子 * 7919 + 刻 * 31 + 1);
  const 速率 = 基速 + r() * 基速;
  const 向 = 单位(朝);
  return Array.from({ length: 个数 }, (_, i) => {
    const 位: 点 = [口[0] + r() * 0.3 - 0.15, 口[1] + r() * 0.3 - 0.15, 口[2] + r() * 0.3 - 0.15];
    const 乱 = 单位([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]);
    return { 位, 速: 乘(单位(加(乘(向, 3), 乱)), 速率), 种子: 种子 * 104729 + 刻 * 64 + i };
  });
};

/**
 * breathAttack（spreadOut = true）：一刻撒 个数 颗。位置 = 口 + 高斯 ÷ 2（每个分量）；
 * 速度 = (朝向 + 高斯 × 0.0075 × 散) × 速率，散 = 散布 × (1 + 随机 ÷ 2)，速率 = 基速 × (1 + 随机)，每颗各抽。
 */
export const 吐息撒 = (口: 点, 朝: 点, 个数: number, 基速: number, 散布: number, 刻: number, 种子: number): { 位: 点; 速: 点; 种子: number }[] => {
  const r = rng(种子 * 7919 + 刻 * 31 + 2);
  const 向 = 单位(朝);
  return Array.from({ length: 个数 }, (_, i) => {
    const 散 = 散布 + r() * (散布 / 2);
    const 速率 = 基速 + r() * 基速;
    const 速 = 乘([向[0] + 高斯(r) * 0.0075 * 散, 向[1] + 高斯(r) * 0.0075 * 散, 向[2] + 高斯(r) * 0.0075 * 散], 速率);
    const 位: 点 = [口[0] + 高斯(r) / 2, 口[1] + 高斯(r) / 2, 口[2] + 高斯(r) / 2];
    return { 位, 速, 种子: 种子 * 104729 + 刻 * 64 + i };
  });
};
