// 驯服时冒的爱心：原版 HeartParticle（1.20.1，client srg jar 反汇编核过）。
// 放法：驯服成功时服务端发实体事件 7，客户端 `TamableAnimal.spawnTamingParticles(true)` 放 7 颗，位置 (x ± 宽, y + 随机 × 高 + 0.5, z ± 宽)
//   （getRandomX(1)、getRandomY() + 0.5、getRandomZ(1)，宽、高是碰撞箱的宽和高）；给的速度（高斯 × 0.02）`HeartParticle.Provider` 不用。
// 构造：父类按速度 0 起随机速度（particleInitVel），再三向 × 0.01、竖直 + 0.1，几乎是正上方 0.1 格/刻；摩擦 0.86，无重力，不碰方块。
//   寿命 16 刻：第 17 次 tick 时移除，所以出生后 [0, 17) 刻都画着，16 刻共升约 0.65 格。
//   quadSize = 父类的 0.1 × (随机 × 0.5 + 0.5) × 2 再 × 1.5（半边长 0.15～0.3 格），画的时候乘 clamp((age + pt) / 16 × 32, 0, 1)，半刻长满。
//   PARTICLE_SHEET_OPAQUE：不透明，alpha 测试。游戏里乘所在格的亮度，这里和 粒子面片 一样不受光。
// 场景坐标（Z 朝上，格），时间单位刻（1 秒 20 刻）。贴图是 client jar 的 particle/heart.png。
import React, { useMemo } from 'react';
import { rng, type V3 } from '../../engine/model/parts.tsx';
import { png } from '../../engine/model/贴图.ts';
import { type Particle, ParticleQuads, particleInitVel, particleTexture } from './粒子面片.tsx';
import heartPng from 'asset:贴图/特效/爱心粒子';

const HEART = png(heartPng);
const 寿命 = 16;
const 摩擦 = 0.86;

// 一颗爱心的出生：刻 = 出生时刻；p = 出生位置；种子 = 这颗自己的随机数
export type HeartSpawn = { 刻: number; p: V3; 种子: number };

// 驯服那一下的 7 颗。脚：实体脚底中心；宽、高：碰撞箱；刻：驯服那一刻
export const tamingHearts = (脚: V3, 宽: number, 高: number, 刻: number, seed: number): HeartSpawn[] => {
  const rand = rng(seed * 7349 + 13);
  return Array.from({ length: 7 }, (_, i) => ({
    刻,
    p: [脚[0] + 宽 * (2 * rand() - 1), 脚[1] + 宽 * (2 * rand() - 1), 脚[2] + 高 * rand() + 0.5] as V3,
    种子: seed * 389 + i,
  }));
};

// 一颗爱心在 刻 时的位置和半边长；没出生或已消失返回 null
export const heartStateAt = (spawn: HeartSpawn, 刻: number): { p: V3; half: number } | null => {
  const τ = 刻 - spawn.刻;
  if (τ < 0 || τ >= 寿命 + 1) return null;
  const rand = rng(spawn.种子 * 2654435761 + 31);
  const half = 0.1 * (rand() * 0.5 + 0.5) * 2 * 1.5;
  const [gx, gy, gz] = particleInitVel(rand, 0, 0, 0);
  // 游戏坐标（y 朝上、z 朝南）换成场景坐标
  let v: V3 = [gx * 0.01, -gz * 0.01, gy * 0.01 + 0.1];
  const age = Math.floor(τ);
  // 画的位置在上一刻末和这一刻末之间插值（比物理晚一刻）
  let cur: V3 = [...spawn.p];
  let prev: V3 = cur;
  for (let k = 0; k < age; k++) {
    prev = cur;
    cur = [cur[0] + v[0], cur[1] + v[1], cur[2] + v[2]];
    v = [v[0] * 摩擦, v[1] * 摩擦, v[2] * 摩擦];
  }
  const pt = τ - age;
  const p: V3 = [prev[0] + (cur[0] - prev[0]) * pt, prev[1] + (cur[1] - prev[1]) * pt, prev[2] + (cur[2] - prev[2]) * pt];
  return { p, half: half * Math.min(1, Math.max(0, (τ / 寿命) * 32)) };
};

// size：整体放大（默认 1 = 原版）
export const HeartParticles: React.FC<{ spawns: HeartSpawn[]; 刻: number; size?: number }> = ({ spawns, 刻: tick, size = 1 }) => {
  const items = useMemo(() => {
    const out: Particle[] = [];
    for (const spawn of spawns) {
      const st = heartStateAt(spawn, tick);
      if (!st || st.half <= 0) continue;
      out.push({ p: st.p, half: st.half * size, uv: [0, 0, 1, 1], color: [1, 1, 1] });
    }
    return out;
  }, [spawns, tick, size]);
  return <ParticleQuads tex={particleTexture(HEART.px, HEART.w, HEART.h, HEART)} items={items} />;
};
