// 通用零件：纯色低模（不贴图）。场景坐标 Z 朝上，1 = MC 一格
import React, { createContext, useContext, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];

// 残影：同一个角色在前几帧的位置再画一遍，所有零件换成半透明单色
export const Ghost = createContext<{ color: string; opacity: number } | null>(null);

type MatProps = { c: string; emissive?: number; opacity?: number; metal?: number; rough?: number; basic?: boolean };
const Mat: React.FC<MatProps> = ({ c: color, emissive = 0, opacity = 1, metal = 0, rough = 0.85, basic }) => {
  const ghost = useContext(Ghost);
  if (ghost) {
    return <meshBasicMaterial color={ghost.color} transparent opacity={ghost.opacity} depthWrite={false} />;
  }
  if (basic) return <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} side={THREE.DoubleSide} />;
  return (
    <meshStandardMaterial
      color={color}
      roughness={rough}
      metalness={metal}
      flatShading
      emissive={emissive > 0 ? color : '#000000'}
      emissiveIntensity={emissive}
      transparent={opacity < 1}
      opacity={opacity}
      depthWrite={opacity >= 1}
    />
  );
};

type Common = MatProps & { p?: V3; r?: V3; shadow?: boolean };
const useShadow = (shadow?: boolean) => {
  const ghost = useContext(Ghost);
  return !ghost && shadow !== false;
};

// 长方体；bottom = 原点在底面中心；bevel = 倒角（低面数的 3A 资产边缘不是完全锐利的）
export const Box: React.FC<Common & { s: V3; bottom?: boolean; bevel?: number }> = ({ s: size, p: pos = [0, 0, 0], r: rot, bottom, bevel, shadow, ...matProps }) => {
  const sh = useShadow(shadow);
  const geo = useMemo(
    () => (bevel ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, Math.min(bevel, Math.min(...size) / 2.01)) : null),
    [size[0], size[1], size[2], bevel],
  );
  return (
    <mesh position={[pos[0], pos[1], pos[2] + (bottom ? size[2] / 2 : 0)]} rotation={rot} castShadow={sh} receiveShadow={sh}>
      {geo ? <primitive object={geo} attach="geometry" /> : <boxGeometry args={size} />}
      <Mat {...matProps} />
    </mesh>
  );
};

// 圆柱（轴沿 Z）：n 为边数，低面数
export const Cyl: React.FC<Common & { rt: number; rb?: number; h: number; n?: number }> = ({ rt, rb, h: height, n: sides = 8, p: pos = [0, 0, 0], r: rot, shadow, ...matProps }) => {
  const sh = useShadow(shadow);
  return (
    <group position={pos} rotation={rot}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={sh} receiveShadow={sh}>
        <cylinderGeometry args={[rt, rb ?? rt, height, sides]} />
        <Mat {...matProps} />
      </mesh>
    </group>
  );
};

// 低面数球（烟团、树冠边角等）
export const Ball: React.FC<Common & { rad: number; detail?: number }> = ({ rad, detail = 1, p: pos = [0, 0, 0], shadow, ...matProps }) => {
  const sh = useShadow(shadow);
  return (
    <mesh position={pos} castShadow={sh} receiveShadow={sh}>
      <icosahedronGeometry args={[rad, detail]} />
      <Mat {...matProps} />
    </mesh>
  );
};

// 齿轮：带齿的低面数圆盘，轴沿本地 Y（贴在朝 +Y 或 -Y 的面上）
export const Gear: React.FC<{ p: V3; rad: number; depth: number; c: string; teeth?: number; axis?: 'x' | 'y' }> = ({ p: pos, rad: radius, depth, c: color, teeth = 8, axis = 'y' }) => (
  <group position={pos} rotation={axis === 'x' ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
    <mesh castShadow>
      <cylinderGeometry args={[radius * 0.78, radius * 0.78, depth, 12]} />
      <Mat c={color} metal={0.4} rough={0.5} />
    </mesh>
    {Array.from({ length: teeth }, (_, i) => {
      const angle = (i / teeth) * Math.PI * 2;
      return (
        <mesh key={i} position={[Math.cos(angle) * radius * 0.85, 0, Math.sin(angle) * radius * 0.85]} rotation={[0, -angle, 0]} castShadow>
          <boxGeometry args={[radius * 0.35, depth, radius * 0.3]} />
          <Mat c={color} metal={0.4} rough={0.5} />
        </mesh>
      );
    })}
    <mesh position={[0, depth * 0.1, 0]}>
      <cylinderGeometry args={[radius * 0.3, radius * 0.3, depth * 1.05, 8]} />
      <Mat c="#3a2a1e" />
    </mesh>
  </group>
);

// 大量静态小方块（地砖、树叶、灌木）用一个 InstancedMesh 画，每块单独颜色
export type Inst = { p: V3; s: V3; c: string; rz?: number };
export const Instanced: React.FC<{ items: Inst[]; shadow?: boolean; mat?: THREE.Material }> = ({ items, shadow = true, mat: custom }) => {
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = custom ?? new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const instMesh = new THREE.InstancedMesh(geo, mat, items.length);
    const placer = new THREE.Object3D();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      placer.position.set(...it.p);
      placer.rotation.set(0, 0, it.rz ?? 0);
      placer.scale.set(...it.s);
      placer.updateMatrix();
      instMesh.setMatrixAt(i, placer.matrix);
      instMesh.setColorAt(i, col.set(it.c));
    });
    instMesh.castShadow = shadow;
    instMesh.receiveShadow = true;
    return instMesh;
  }, [items, shadow, custom]);
  return <primitive object={mesh} />;
};

// 确定性随机数：每帧重算的场景必须每次得到同样的布局
export const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
export const pick = <Item,>(r: () => number, arr: readonly Item[]) => arr[Math.floor(r() * arr.length)];
