// 丁组的两种贴地环：Goety 的 ShockwaveParticle（冲击波环）和 SmashParticle（砸地的一圈矮墙）。
// - 冲击波环：贴图 particle/shockwave，平躺，半边长 = 大小 × clamp(年龄 ÷ 寿命 × 0.75, 0, 2)（非反向）；
//   每刻年龄 += 速度 再 +1，所以速度 1 时 30 寿命 15 刻放完；透明度 淡出 ? 1 − 年龄 ÷ 寿命 : 1；半透明粒子表、满亮度。
// - 砸地墙：32 段的开口圆筒，半径 = OUT_CUBIC(年龄 ÷ 寿命) × 宽，下沿 alpha = IN_CUBIC(clamp(年龄 ÷ (寿命 ÷ 1.25))) 从 1 落到 0，上沿 alpha 0，
//   加色（DRAGON_RAYS_QUADS）；SmashParticleOption(色, 宽, 寿命) 的高 = 宽 × 0.06。
import React from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../接口.ts';
import { GroundDecal } from './地面贴花.tsx';
import type { RgbColor } from './材质.ts';
import shockwavePng from 'asset:贴图/法术/goety/particle/shockwave';

const ringImg = png(shockwavePng);

/** 刻 = 出生后的刻（带小数）；位 = 粒子出生点（地面贴花自己贴在这个高度） */
export const ShockwaveRing: React.FC<{ 位: Vec3; 刻: number; size: number; 色: RgbColor; 速?: number; fadeOut?: boolean; 寿命?: number }> = ({ 位: pos, 刻: tick, size: size, 色: color, 速: speed = 0, fadeOut = true, 寿命: lifetime = 30 }) => {
  const age = tick * (1 + speed);
  if (tick < 0 || age >= lifetime) return null;
  return <GroundDecal 位={pos} image={ringImg} radius={size * Math.min(2, Math.max(0, (age / lifetime) * 0.75))} lift={0} blend="半透明" 色={color} opacity={fadeOut ? 1 - age / lifetime : 1} />;
};

// 单位圆筒：下沿白、上沿黑，加色混合下上沿就是 alpha 0
const wallGeometry = (() => {
  const segCount = 32;
  const positions: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = (i * Math.PI * 2) / segCount;
    const b = ((i + 1) * Math.PI * 2) / segCount;
    const vertices: [number, number, number][] = [
      [Math.cos(a), Math.sin(a), 0],
      [Math.cos(b), Math.sin(b), 0],
      [Math.cos(b), Math.sin(b), 1],
      [Math.cos(a), Math.sin(a), 1],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      positions.push(...vertices[k]!);
      const brightness = vertices[k]![2] === 0 ? 1 : 0;
      colors.push(brightness, brightness, brightness);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
})();
const wallMaterialCache = new Map<string, THREE.MeshBasicMaterial>();
const wallMaterial = (c: RgbColor, opacity: number) => {
  const a = Math.round(opacity * 256) / 256;
  const cacheKey = `${c.join(',')}|${a}`;
  let m = wallMaterialCache.get(cacheKey);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color().setRGB(c[0] * a, c[1] * a, c[2] * a, THREE.SRGBColorSpace), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    wallMaterialCache.set(cacheKey, m);
  }
  return m;
};

/** 刻 = 出生后的刻；位 = 圆筒底圈圆心 */
export const SlamWall: React.FC<{ 位: Vec3; 刻: number; width: number; 色: RgbColor; 寿命: number }> = ({ 位: pos, 刻: tick, width: maxWidth, 色: color, 寿命: lifetime }) => {
  if (tick < 0 || tick >= lifetime) return null;
  const t = tick / lifetime;
  const radius = maxWidth * (1 - (1 - t) ** 3);
  const u = Math.min(1, Math.max(0, tick / (lifetime / 1.25)));
  const opacity = 1 - u ** 3;
  return <mesh position={[pos[0], pos[1], pos[2]]} scale={[radius, radius, maxWidth * 0.06]} geometry={wallGeometry} material={wallMaterial(color, opacity)} frustumCulled={false} />;
};
