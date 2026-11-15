// 现实部分的物件按原版方块、物品的样子搭：一块块朝南的正面和朝上的顶面，贴 像素图.ts 画的贴图，放进三渲二画布（平涂按面朝向乘明暗，顶面 1、正面 0.8，同方块）。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上），单位是贴图像素（一格 16 个）：外面包一层 <像素空间 位={格}>，里面的东西都按贴图像素写，边就落在像素网格上。
// 镜头只朝北看（侧剖面的正交机位），侧面、背面看不见，所以只做正面和顶面；要换别的朝向再补。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';

/** 里面按贴图像素写；位 是这层原点在场景里的位置（格） */
export const PixelSpace: React.FC<{ 位: V3; children: React.ReactNode }> = ({ 位: pos, children }) => (
  <group position={pos as [number, number, number]} scale={1 / 16}>
    {children}
  </group>
);

const materialTable = new WeakMap<THREE.Texture, THREE.MeshStandardMaterial>();
/** 贴图的材质（同一张贴图共用一个）：镂空（alphaTest，同原版 cutout），受光材质好让平涂接手 */
export const pixelMaterial = (image: THREE.Texture) => {
  let m = materialTable.get(image);
  if (!m) materialTable.set(image, (m = new THREE.MeshStandardMaterial({ map: image, alphaTest: 0.5, roughness: 1 })));
  return m;
};

/** 贴图换了（或卸载）就释放旧的；材质跟着贴图走 */
export const useTexture = (make: () => THREE.Texture, deps: readonly unknown[]) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(make, deps);
  useEffect(
    () => () => {
      materialTable.get(t)?.dispose();
      t.dispose();
    },
    [t],
  );
  return t;
};

const unitPlane = new THREE.PlaneGeometry(1, 1);

/** 一片朝南（−y）的正面：左下角在 (x, y, z)，宽 × 高 贴图像素，贴图上边朝上 */
export const FrontFace: React.FC<{ x: number; y: number; z: number; 宽: number; 高: number; 图: THREE.Texture }> = ({ x, y, z, 宽: width, 高: height, 图: image }) => (
  <mesh geometry={unitPlane} material={pixelMaterial(image)} position={[x + width / 2, y, z + height / 2]} rotation={[Math.PI / 2, 0, 0]} scale={[width, height, 1]} />
);

/** 一片朝上（+z）的顶面：前左角在 (x, y, z)，宽 × 深 贴图像素，贴图上边在北（远处） */
export const TopFace: React.FC<{ x: number; y: number; z: number; 宽: number; depth: number; 图: THREE.Texture }> = ({ x, y, z, 宽: width, depth, 图: image }) => (
  <mesh geometry={unitPlane} material={pixelMaterial(image)} position={[x + width / 2, y + depth / 2, z]} scale={[width, depth, 1]} />
);

/** 一块盒子的正面和顶面：前左下角在 (x, y, z)，宽（x）× 深（y）× 高（z） */
export const PixelBox: React.FC<{ x: number; y: number; z: number; 宽: number; depth: number; 高: number; 前: THREE.Texture; topTexture: THREE.Texture }> = ({ x, y, z, 宽: width, depth, 高: height, 前: front, topTexture }) => (
  <>
    <FrontFace x={x} y={y} z={z} 宽={width} 高={height} 图={front} />
    <TopFace x={x} y={y} z={z + height} 宽={width} depth={depth} 图={topTexture} />
  </>
);
