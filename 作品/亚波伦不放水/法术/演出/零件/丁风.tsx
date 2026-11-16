// WindParticle（ServerParticleUtil.windParticle）：绕着一个主人转的风带，旋风、上升气流、冲刺用。
// 位置 = 主人位置 + (0, 高, 宽) 绕竖直轴转 (初角 + 转速 × 年龄) 度；初角随机 0～360，转速 = (10～20) × (−1、0、1 随机)（度/刻）；
// 寿命没给就是 20～39 刻；透明度 1 − 年龄 ÷ 寿命；带子取最近 4 段、高 0.5（WindTrailParticle 的 sampleSize 4），贴图 trail，亮度 240。
import React from 'react';
import type { Vec3 } from '../接口.ts';
import type { RgbColor } from './材质.ts';
import { WindBand } from './游带.tsx';
import { mulberry32 } from '@engine/core/数学.ts';

export interface WindBirth {
  /** 出生的刻 */
  刻: number;
  /** 主人在绝对刻 k 末的位置（场景坐标） */
  originAt: (absTick: number) => Vec3;
  width: number;
  height: number;
  seed: number;
  寿命?: number;
}

/** 游戏 Vec3(0, 高, 宽).yRot(θ) → 场景坐标的偏移 */
const orbitOffset = (orbitWidth: number, height: number, angleDeg: number): Vec3 => {
  const t = (angleDeg * Math.PI) / 180;
  return [orbitWidth * Math.sin(t), -orbitWidth * Math.cos(t), height];
};

export const WindParticles: React.FC<{ spawns: readonly WindBirth[]; 刻: number; 色: RgbColor }> = ({ spawns, 刻: tick, 色: color }) => (
  <>
    {spawns.map((spawn, i) => {
      const age = tick - spawn.刻;
      const r = mulberry32(spawn.seed * 2654435761 + 97);
      const lifetime = spawn.寿命 ?? 20 + Math.floor(r() * 20);
      const initAngleDeg = r() * 360;
      const rotSpeed = (10 + r() * 10) * (Math.floor(r() * 3) - 1);
      if (age < 0 || age >= lifetime) return null;
      const positionAt = (k: number): Vec3 => {
        const ownerPos = spawn.originAt(spawn.刻 + k);
        const offset = orbitOffset(spawn.width, spawn.height, initAngleDeg + rotSpeed * k);
        return [ownerPos[0] + offset[0], ownerPos[1] + offset[1], ownerPos[2] + offset[2]];
      };
      return <WindBand key={i} 位置={positionAt} age={age} 段数={4} height={0.5} 色={color} opacity={1 - Math.floor(age) / lifetime} />;
    })}
  </>
);
