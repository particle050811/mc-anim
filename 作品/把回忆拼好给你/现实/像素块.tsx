// 现实部分的物件按原版方块、物品的样子搭：一块块朝南的正面和朝上的顶面，贴 像素图.ts 画的贴图，放进三渲二画布（平涂按面朝向乘明暗，顶面 1、正面 0.8，同方块）。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上），单位是贴图像素（一格 16 个）：外面包一层 <像素空间 位={格}>，里面的东西都按贴图像素写，边就落在像素网格上。
// 镜头只朝北看（侧剖面的正交机位），侧面、背面看不见，所以只做正面和顶面；要换别的朝向再补。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';

/** 里面按贴图像素写；位 是这层原点在场景里的位置（格） */
export const 像素空间: React.FC<{ 位: V3; children: React.ReactNode }> = ({ 位, children }) => (
  <group position={位 as [number, number, number]} scale={1 / 16}>
    {children}
  </group>
);

const 材质表 = new WeakMap<THREE.Texture, THREE.MeshStandardMaterial>();
/** 贴图的材质（同一张贴图共用一个）：镂空（alphaTest，同原版 cutout），受光材质好让平涂接手 */
export const 像素材质 = (图: THREE.Texture) => {
  let m = 材质表.get(图);
  if (!m) 材质表.set(图, (m = new THREE.MeshStandardMaterial({ map: 图, alphaTest: 0.5, roughness: 1 })));
  return m;
};

/** 贴图换了（或卸载）就释放旧的；材质跟着贴图走 */
export const 用贴图 = (造: () => THREE.Texture, 依赖: readonly unknown[]) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(造, 依赖);
  useEffect(
    () => () => {
      材质表.get(t)?.dispose();
      t.dispose();
    },
    [t],
  );
  return t;
};

const 单位片 = new THREE.PlaneGeometry(1, 1);

/** 一片朝南（−y）的正面：左下角在 (x, y, z)，宽 × 高 贴图像素，贴图上边朝上 */
export const 正面: React.FC<{ x: number; y: number; z: number; 宽: number; 高: number; 图: THREE.Texture }> = ({ x, y, z, 宽, 高, 图 }) => (
  <mesh geometry={单位片} material={像素材质(图)} position={[x + 宽 / 2, y, z + 高 / 2]} rotation={[Math.PI / 2, 0, 0]} scale={[宽, 高, 1]} />
);

/** 一片朝上（+z）的顶面：前左角在 (x, y, z)，宽 × 深 贴图像素，贴图上边在北（远处） */
export const 顶面: React.FC<{ x: number; y: number; z: number; 宽: number; 深: number; 图: THREE.Texture }> = ({ x, y, z, 宽, 深, 图 }) => (
  <mesh geometry={单位片} material={像素材质(图)} position={[x + 宽 / 2, y + 深 / 2, z]} scale={[宽, 深, 1]} />
);

/** 一块盒子的正面和顶面：前左下角在 (x, y, z)，宽（x）× 深（y）× 高（z） */
export const 像素盒: React.FC<{ x: number; y: number; z: number; 宽: number; 深: number; 高: number; 前: THREE.Texture; 顶: THREE.Texture }> = ({ x, y, z, 宽, 深, 高, 前, 顶 }) => (
  <>
    <正面 x={x} y={y} z={z} 宽={宽} 高={高} 图={前} />
    <顶面 x={x} y={y} z={z + 高} 宽={宽} 深={深} 图={顶} />
  </>
);
