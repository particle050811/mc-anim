// 绝对零度的两样客户端画法（revelationfix 2.x）：
// - 领域墙（SpellClientContext.WandUsingCircle.render）：绕施法者的 22 段圆筒，半径 = 领域半径，高 0.3～1.0 格，
//   上沿 (0.5569, 0.7725, 0.9882) × alpha 0.6、下沿 (0.721, 0.741, 0.725) × alpha 0.12，贴图是白底，普通半透明混合。起手 5 刻淡入。
// - 边界粒子环（PacketClientProxy.iceSpellPacket_handle0 id 0，每 40 刻一次）：圆周上每格弧长 4 组、每组 2 颗 FROST_FLOWER，高 0.3 格，
//   第一颗速度 (高斯(0, 0.02), 高斯(1.0, 0.04), 高斯(0, 0.02))，第二颗位置再偏 高斯(0, 0.1)、速度 (高斯(0, 0.02) + 高斯(0, 0.1), 高斯(0.4, 0.04), 高斯(0, 0.02))；粒子再各加 ±0.05 随机速度。
import React from 'react';
import * as THREE from 'three';
import { rng } from '@engine/model/parts.tsx';
import type { Vec3 } from '../接口.ts';
import { gaussian } from './甲/共用.ts';
import type { ParticleBirth } from './粒子.tsx';

const topColor = [0.5568628, 0.77254903, 0.9882353] as const;
const bottomColor = [0.721, 0.741, 0.725] as const;
const toLinear = (c: readonly [number, number, number]) => {
  const k = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  return [k.r, k.g, k.b] as const;
};

const wallGeometry = (() => {
  const segCount = 22;
  const positions: number[] = [];
  const colors: number[] = [];
  const topLinear = toLinear(topColor);
  const bottomLinear = toLinear(bottomColor);
  const polarPoint = (f: number, radius: number) => [Math.cos(f) * radius, Math.sin(f) * radius];
  for (let i = 0; i < segCount; i++) {
    const a = ((i + 1) * Math.PI * 2) / segCount;
    const b = ((i + 2) * Math.PI * 2) / segCount;
    const [x1, y1] = polarPoint(a, 1);
    const [x2, y2] = polarPoint(b, 1);
    const vertices: [number, number, number, boolean][] = [
      [x1, y1, 1.0, true],
      [x2, y2, 1.0, true],
      [x2, y2, 0.3, false],
      [x1, y1, 0.3, false],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const v = vertices[k]!;
      positions.push(v[0], v[1], v[2]);
      colors.push(...(v[3] ? topLinear : bottomLinear), v[3] ? 0.6 : 0.12);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  return g;
})();

const wallMaterialCache = new Map<number, THREE.MeshBasicMaterial>();
const wallMaterial = (fadeIn: number) => {
  const a = Math.round(fadeIn * 64) / 64;
  let m = wallMaterialCache.get(a);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: a, depthWrite: false, side: THREE.DoubleSide });
    wallMaterialCache.set(a, m);
  }
  return m;
};

/** 位 = 施法者脚底；刻 = 引导了几刻 */
export const FrostWall: React.FC<{ 位: Vec3; radius: number; 刻: number }> = ({ 位: pos, radius, 刻: tick }) => (
  <mesh position={[pos[0], pos[1], pos[2]]} scale={[radius, radius, 1]} geometry={wallGeometry} material={wallMaterial(Math.min(1, Math.max(0.0001, tick / 5)))} frustumCulled={false} renderOrder={2} />
);

/** 一次边界粒子环的出生表（场景坐标）。位 = 施法者脚底 */
export const frostRingSpawns = (seed: number, pos: Vec3, radius: number, launchTick: number): ParticleBirth[] => {
  const r = rng(seed);
  const frostSpawns: ParticleBirth[] = [];
  const jitter = () => (r() * 2 - 1) * 0.05;
  const gaussAround = (mean: number, diffScale: number) => mean + gaussian(r) * diffScale;
  const lifetime = () => Math.floor(16 / (r() * 0.8 + 0.2)) + 2;
  const particleRadius = () => 0.1 * (r() * r() + 1);
  for (let i = 0; i < Math.PI * 2 * radius; i++) {
    for (let j = 1; j < 5; j++) {
      const x = Math.cos(i / (Math.PI * 2)) * radius + pos[0];
      const y = Math.sin(i / (Math.PI * 2)) * radius + pos[1];
      // 游戏 (x, y竖直, z) → 场景 (x, −z, y)
      const v1 = [gaussAround(0, 0.02) + jitter(), gaussAround(1.0, 0.04) + jitter(), gaussAround(0, 0.02) + jitter()] as const;
      frostSpawns.push({ 刻: launchTick, 位: [x, y, pos[2] + 0.3], 速: [v1[0], -v1[2], v1[1]], 寿命: lifetime(), radius: particleRadius(), 种子: Math.floor(r() * 1e9) });
      const px = x + gaussAround(0, 0.1);
      const v2 = [gaussAround(0, 0.02) + gaussAround(0, 0.1) + jitter(), gaussAround(0.4, 0.04) + jitter(), gaussAround(0, 0.02) + jitter()] as const;
      frostSpawns.push({ 刻: launchTick, 位: [px, y, pos[2] + 0.3 + gaussAround(0.3, 0.1)], 速: [v2[0], -v2[2], v2[1]], 寿命: lifetime(), radius: particleRadius(), 种子: Math.floor(r() * 1e9) });
    }
  }
  return frostSpawns;
};
