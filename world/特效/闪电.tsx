// 闪电：照游戏原版 LightningBoltRenderer 的画法（暮色传送门激活时劈下来的就是原版闪电实体）。
// 主干从落点往上 8 段、每段 16 格（共 128 格），每段水平随机偏 ±5 格；另有 2 条分叉，从主干第 6、5 段起各往下 3 段，每段偏 ±15 格。
// 每段是一根方截面的细柱，同一条路径叠 4 层、宽度 0.1 / 0.3 / 0.5 / 0.7 格，颜色 (0.45, 0.45, 0.5)、加色混合，所以芯最亮、外圈淡蓝白。
// 游戏里一道闪电形状不变、亮度闪几下；这里 flash（0～1）控制亮度，seed 换形状。原点是落点，Z 朝上。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng } from '../../engine/model/parts.tsx';

const SEG = 16;

const boltGeometry = (seed: number) => {
  const rand = rng(seed);
  const ri = (n: number) => Math.floor(rand() * n); // 同 Java 的 nextInt(n)
  // 主干各段节点的水平偏移（从最上面一段往下累加，最后整体平移让落点在原点）
  const xs: number[] = [];
  const ys: number[] = [];
  let x = 0;
  let y = 0;
  for (let i = 7; i >= 0; i--) {
    xs[i] = x;
    ys[i] = y;
    x += ri(11) - 5;
    y += ri(11) - 5;
  }
  const pos: number[] = [];
  // 一段方柱：下端中心 (bx, by, z0) 半宽 w0，上端中心 (tx, ty, z1) 半宽 w1，画四个侧面
  const prism = (bx: number, by: number, z0: number, w0: number, tx: number, ty: number, z1: number, w1: number) => {
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = corners[k];
      const [cx, cy] = corners[(k + 1) % 4];
      const p0 = [bx + ax * w0, by + ay * w0, z0];
      const p1 = [bx + cx * w0, by + cy * w0, z0];
      const p2 = [tx + cx * w1, ty + cy * w1, z1];
      const p3 = [tx + ax * w1, ty + ay * w1, z1];
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    }
  };
  for (let layer = 0; layer < 4; layer++) {
    // 每一层都用同一个种子从头重放（原版就是这样），主干那一路的随机数和上面算节点偏移的完全一样，所以最下面一段正好落回落点
    const lr = rng(seed);
    const lri = (n: number) => Math.floor(lr() * n);
    for (let branch = 0; branch < 3; branch++) {
      const top = branch > 0 ? 7 - branch : 7;
      const bottom = branch > 0 ? top - 2 : 0;
      let bx = xs[top] - x;
      let by = ys[top] - y;
      for (let seg = top; seg >= bottom; seg--) {
        const px = bx;
        const py = by;
        if (branch === 0) {
          bx += lri(11) - 5;
          by += lri(11) - 5;
        } else {
          bx += lri(31) - 15;
          by += lri(31) - 15;
        }
        let w1 = 0.1 + layer * 0.2;
        let w0 = 0.1 + layer * 0.2;
        if (branch === 0) {
          w1 *= seg * 0.1 + 1;
          w0 *= (seg - 1) * 0.1 + 1;
        }
        prism(bx, by, seg * SEG, w0 / 2, px, py, (seg + 1) * SEG, w1 / 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geometry;
};

export const LightningBolt: React.FC<{ seed?: number; flash?: number; position?: [number, number, number] }> = ({ seed = 7, flash = 1, position }) => {
  const geo = useMemo(() => boltGeometry(seed), [seed]);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.45, 0.45, 0.5).multiplyScalar(0.3 * 2.5),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      }),
    [],
  );
  mat.opacity = flash;
  if (flash <= 0) return null;
  return (
    <group position={position}>
      <mesh geometry={geo} material={mat} renderOrder={10} />
      {/* 劈中时照亮周围：游戏里闪电会把整片天空和地面打亮 */}
      <pointLight position={[0, 0, 6]} color="#dfe6ff" intensity={600 * flash} distance={60} decay={2} />
    </group>
  );
};
