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

// 确定性随机数：每帧重算的场景必须每次得到同样的布局
