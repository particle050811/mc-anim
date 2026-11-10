// 绝对零度的两样客户端画法（revelationfix 2.x）：
// - 领域墙（SpellClientContext.WandUsingCircle.render）：绕施法者的 22 段圆筒，半径 = 领域半径，高 0.3～1.0 格，
//   上沿 (0.5569, 0.7725, 0.9882) × alpha 0.6、下沿 (0.721, 0.741, 0.725) × alpha 0.12，贴图是白底，普通半透明混合。起手 5 刻淡入。
// - 边界粒子环（PacketClientProxy.iceSpellPacket_handle0 id 0，每 40 刻一次）：圆周上每格弧长 4 组、每组 2 颗 FROST_FLOWER，高 0.3 格，
//   第一颗速度 (高斯(0, 0.02), 高斯(1.0, 0.04), 高斯(0, 0.02))，第二颗位置再偏 高斯(0, 0.1)、速度 (高斯(0, 0.02) + 高斯(0, 0.1), 高斯(0.4, 0.04), 高斯(0, 0.02))；粒子再各加 ±0.05 随机速度。
import React from 'react';
import * as THREE from 'three';
import { rng } from '@engine/model/parts.tsx';
import type { 点 } from '../接口.ts';
import { 高斯 } from './甲/共用.ts';
import type { 粒子出生 } from './粒子.tsx';

const 上色 = [0.5568628, 0.77254903, 0.9882353] as const;
const 下色 = [0.721, 0.741, 0.725] as const;
const 线性 = (c: readonly [number, number, number]) => {
  const k = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  return [k.r, k.g, k.b] as const;
};

const 墙几何 = (() => {
  const 段 = 22;
  const 位: number[] = [];
  const 色: number[] = [];
  const 上 = 线性(上色);
  const 下 = 线性(下色);
  const 点们 = (f: number, 半径: number) => [Math.cos(f) * 半径, Math.sin(f) * 半径];
  for (let i = 0; i < 段; i++) {
    const a = ((i + 1) * Math.PI * 2) / 段;
    const b = ((i + 2) * Math.PI * 2) / 段;
    const [x1, y1] = 点们(a, 1);
    const [x2, y2] = 点们(b, 1);
    const 顶点: [number, number, number, boolean][] = [
      [x1, y1, 1.0, true],
      [x2, y2, 1.0, true],
      [x2, y2, 0.3, false],
      [x1, y1, 0.3, false],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const v = 顶点[k]!;
      位.push(v[0], v[1], v[2]);
      色.push(...(v[3] ? 上 : 下), v[3] ? 0.6 : 0.12);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(位, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(色, 4));
  return g;
})();

const 墙材质缓存 = new Map<number, THREE.MeshBasicMaterial>();
const 墙材质 = (淡入: number) => {
  const a = Math.round(淡入 * 64) / 64;
  let m = 墙材质缓存.get(a);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: a, depthWrite: false, side: THREE.DoubleSide });
    墙材质缓存.set(a, m);
  }
  return m;
};

/** 位 = 施法者脚底；刻 = 引导了几刻 */
export const 霜墙: React.FC<{ 位: 点; 半径: number; 刻: number }> = ({ 位, 半径, 刻 }) => (
  <mesh position={[位[0], 位[1], 位[2]]} scale={[半径, 半径, 1]} geometry={墙几何} material={墙材质(Math.min(1, Math.max(0.0001, 刻 / 5)))} frustumCulled={false} renderOrder={2} />
);

/** 一次边界粒子环的出生表（场景坐标）。位 = 施法者脚底 */
export const 霜环粒子们 = (种子: number, 位: 点, 半径: number, 出刻: number): 粒子出生[] => {
  const r = rng(种子);
  const 出: 粒子出生[] = [];
  const 抖 = () => (r() * 2 - 1) * 0.05;
  const 随 = (均: number, 差: number) => 均 + 高斯(r) * 差;
  const 寿命 = () => Math.floor(16 / (r() * 0.8 + 0.2)) + 2;
  const 半 = () => 0.1 * (r() * r() + 1);
  for (let i = 0; i < Math.PI * 2 * 半径; i++) {
    for (let j = 1; j < 5; j++) {
      const x = Math.cos(i / (Math.PI * 2)) * 半径 + 位[0];
      const y = Math.sin(i / (Math.PI * 2)) * 半径 + 位[1];
      // 游戏 (x, y竖直, z) → 场景 (x, −z, y)
      const v1 = [随(0, 0.02) + 抖(), 随(1.0, 0.04) + 抖(), 随(0, 0.02) + 抖()] as const;
      出.push({ 刻: 出刻, 位: [x, y, 位[2] + 0.3], 速: [v1[0], -v1[2], v1[1]], 寿命: 寿命(), 半径: 半(), 种子: Math.floor(r() * 1e9) });
      const px = x + 随(0, 0.1);
      const v2 = [随(0, 0.02) + 随(0, 0.1) + 抖(), 随(0.4, 0.04) + 抖(), 随(0, 0.02) + 抖()] as const;
      出.push({ 刻: 出刻, 位: [px, y, 位[2] + 0.3 + 随(0.3, 0.1)], 速: [v2[0], -v2[2], v2[1]], 寿命: 寿命(), 半径: 半(), 种子: Math.floor(r() * 1e9) });
    }
  }
  return 出;
};
