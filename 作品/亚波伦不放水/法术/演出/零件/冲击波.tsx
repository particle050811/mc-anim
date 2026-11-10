// 丁组的两种贴地环：Goety 的 ShockwaveParticle（冲击波环）和 SmashParticle（砸地的一圈矮墙）。
// - 冲击波环：贴图 particle/shockwave，平躺，半边长 = 大小 × clamp(年龄 ÷ 寿命 × 0.75, 0, 2)（非反向）；
//   每刻年龄 += 速度 再 +1，所以速度 1 时 30 寿命 15 刻放完；透明度 淡出 ? 1 − 年龄 ÷ 寿命 : 1；半透明粒子表、满亮度。
// - 砸地墙：32 段的开口圆筒，半径 = OUT_CUBIC(年龄 ÷ 寿命) × 宽，下沿 alpha = IN_CUBIC(clamp(年龄 ÷ (寿命 ÷ 1.25))) 从 1 落到 0，上沿 alpha 0，
//   加色（DRAGON_RAYS_QUADS）；SmashParticleOption(色, 宽, 寿命) 的高 = 宽 × 0.06。
import React from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import type { 点 } from '../接口.ts';
import { 地面贴花 } from './地面贴花.tsx';
import type { 色 } from './材质.ts';
import 环图数据 from 'asset:贴图/法术/goety/particle/shockwave';

const 环图 = png(环图数据);

/** 刻 = 出生后的刻（带小数）；位 = 粒子出生点（地面贴花自己贴在这个高度） */
export const 冲击波环: React.FC<{ 位: 点; 刻: number; 大小: number; 色: 色; 速?: number; 淡出?: boolean; 寿命?: number }> = ({ 位, 刻, 大小, 色, 速 = 0, 淡出 = true, 寿命 = 30 }) => {
  const 年龄 = 刻 * (1 + 速);
  if (刻 < 0 || 年龄 >= 寿命) return null;
  return <地面贴花 位={位} 图={环图} 半径={大小 * Math.min(2, Math.max(0, (年龄 / 寿命) * 0.75))} 抬高={0} 混合="半透明" 色={色} 透明度={淡出 ? 1 - 年龄 / 寿命 : 1} />;
};

// 单位圆筒：下沿白、上沿黑，加色混合下上沿就是 alpha 0
const 墙几何 = (() => {
  const 段 = 32;
  const 位: number[] = [];
  const 色: number[] = [];
  for (let i = 0; i < 段; i++) {
    const a = (i * Math.PI * 2) / 段;
    const b = ((i + 1) * Math.PI * 2) / 段;
    const 顶点: [number, number, number][] = [
      [Math.cos(a), Math.sin(a), 0],
      [Math.cos(b), Math.sin(b), 0],
      [Math.cos(b), Math.sin(b), 1],
      [Math.cos(a), Math.sin(a), 1],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      位.push(...顶点[k]!);
      const 亮 = 顶点[k]![2] === 0 ? 1 : 0;
      色.push(亮, 亮, 亮);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(位, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(色, 3));
  return g;
})();
const 墙材质缓存 = new Map<string, THREE.MeshBasicMaterial>();
const 墙材质 = (c: 色, 透明度: number) => {
  const a = Math.round(透明度 * 256) / 256;
  const 键 = `${c.join(',')}|${a}`;
  let m = 墙材质缓存.get(键);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color().setRGB(c[0] * a, c[1] * a, c[2] * a, THREE.SRGBColorSpace), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    墙材质缓存.set(键, m);
  }
  return m;
};

/** 刻 = 出生后的刻；位 = 圆筒底圈圆心 */
export const 砸地墙: React.FC<{ 位: 点; 刻: number; 宽: number; 色: 色; 寿命: number }> = ({ 位, 刻, 宽, 色, 寿命 }) => {
  if (刻 < 0 || 刻 >= 寿命) return null;
  const t = 刻 / 寿命;
  const 半径 = 宽 * (1 - (1 - t) ** 3);
  const u = Math.min(1, Math.max(0, 刻 / (寿命 / 1.25)));
  const 透明度 = 1 - u ** 3;
  return <mesh position={[位[0], 位[1], 位[2]]} scale={[半径, 半径, 宽 * 0.06]} geometry={墙几何} material={墙材质(色, 透明度)} frustumCulled={false} />;
};
