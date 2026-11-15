// 贴地扩散环：Goety 的 CircleExplodeParticle（GroundCircleParticle 的子类，粒子定义 circle_explode.json 用 circle_explode1～8）。乙组砸地、爆炸的法术用。
// 平躺的方片，半边长 = 选项里的 size（格），满亮度，带颜色；寿命 30，每刻 age += speed + 1，贴图按 age 走；不动。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../接口.ts';
import { GroundDecal } from './地面贴花.tsx';
import type { RgbColor } from './材质.ts';
import circleExplode1Png from 'asset:贴图/法术/goety/particle/circle_explode1';
import circleExplode2Png from 'asset:贴图/法术/goety/particle/circle_explode2';
import circleExplode3Png from 'asset:贴图/法术/goety/particle/circle_explode3';
import circleExplode4Png from 'asset:贴图/法术/goety/particle/circle_explode4';
import circleExplode5Png from 'asset:贴图/法术/goety/particle/circle_explode5';
import circleExplode6Png from 'asset:贴图/法术/goety/particle/circle_explode6';
import circleExplode7Png from 'asset:贴图/法术/goety/particle/circle_explode7';
import circleExplode8Png from 'asset:贴图/法术/goety/particle/circle_explode8';

const animFrames = [circleExplode1Png, circleExplode2Png, circleExplode3Png, circleExplode4Png, circleExplode5Png, circleExplode6Png, circleExplode7Png, circleExplode8Png].map(png);

/** 出生刻 和 秒 × 20 同一个钟；加速 = 选项里的 speed（0 时 30 刻放完，1 时 15 刻） */
export const RingBurst: React.FC<{ 位: Vec3; spawnTick: number; 秒: number; 大小: number; 颜色: RgbColor; accel?: number }> = ({ 位: pos, spawnTick, 秒: sec, 大小: size, 颜色: ringColor, accel = 0 }) => {
  const ageTick = Math.floor(sec * 20 - spawnTick);
  if (ageTick < 0) return null;
  const age = ageTick * (accel + 1);
  if (age >= 30) return null;
  return <GroundDecal 位={pos} 图={animFrames[Math.min(7, Math.floor((age * 8) / 30))]!} radius={size} 色={ringColor} lift={0.05} />;
};
