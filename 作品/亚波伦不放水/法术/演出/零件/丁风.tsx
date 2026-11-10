// WindParticle（ServerParticleUtil.windParticle）：绕着一个主人转的风带，旋风、上升气流、冲刺用。
// 位置 = 主人位置 + (0, 高, 宽) 绕竖直轴转 (初角 + 转速 × 年龄) 度；初角随机 0～360，转速 = (10～20) × (−1、0、1 随机)（度/刻）；
// 寿命没给就是 20～39 刻；透明度 1 − 年龄 ÷ 寿命；带子取最近 4 段、高 0.5（WindTrailParticle 的 sampleSize 4），贴图 trail，亮度 240。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import type { 点 } from '../接口.ts';
import type { 色 } from './材质.ts';
import { 风带 } from './游带.tsx';

export interface 风粒生 {
  /** 出生的刻 */
  刻: number;
  /** 主人在绝对刻 k 末的位置（场景坐标） */
  主人: (绝对刻: number) => 点;
  宽: number;
  高: number;
  种子: number;
  寿命?: number;
}

/** 游戏 Vec3(0, 高, 宽).yRot(θ) → 场景坐标的偏移 */
const 轨道偏移 = (宽: number, 高: number, 角度: number): 点 => {
  const t = (角度 * Math.PI) / 180;
  return [宽 * Math.sin(t), -宽 * Math.cos(t), 高];
};

export const 风粒们: React.FC<{ 出生们: readonly 风粒生[]; 刻: number; 色: 色 }> = ({ 出生们, 刻, 色 }) => (
  <>
    {出生们.map((生, i) => {
      const 龄 = 刻 - 生.刻;
      const r = rng(生.种子 * 2654435761 + 97);
      const 寿命 = 生.寿命 ?? 20 + Math.floor(r() * 20);
      const 初角 = r() * 360;
      const 转速 = (10 + r() * 10) * (Math.floor(r() * 3) - 1);
      if (龄 < 0 || 龄 >= 寿命) return null;
      const 位置 = (k: number): 点 => {
        const 主 = 生.主人(生.刻 + k);
        const 偏 = 轨道偏移(生.宽, 生.高, 初角 + 转速 * k);
        return [主[0] + 偏[0], 主[1] + 偏[1], 主[2] + 偏[2]];
      };
      return <风带 key={i} 位置={位置} 年龄={龄} 段数={4} 高={0.5} 色={色} 透明度={1 - Math.floor(龄) / 寿命} />;
    })}
  </>
);
