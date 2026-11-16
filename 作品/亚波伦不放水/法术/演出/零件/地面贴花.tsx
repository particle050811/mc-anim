// 地面贴花：平铺在地上的一张贴图（预警圈 AoEParticle、冲击波环 ShockwaveParticle、法阵这类贴地的方片）。
// 游戏里这类粒子画在地面上方一点点（各类自己加 0.01～0.1 格），这里默认抬 0.02 格免得和地面抢深度。
import React from 'react';
import type { Png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../接口.ts';
import { faceMaterial, type FaceMaterialOptions } from './材质.ts';

export const GroundDecal: React.FC<
  FaceMaterialOptions & {
    /** 中心（落在地面上的点） */
    位: Vec3;
    image: Png | null;
    /** 半边长（格） */
    radius: number;
    /** 绕竖直轴转的弧度 */
    angleRad?: number;
    lift?: number;
  }
> = ({ 位: pos, image: image, radius, angleRad = 0, lift = 0.02, ...materialOpts }) => (
  // planeGeometry 在 XY 平面、法线 +Z，场景 Z 朝上，正好平躺；贴图第一行朝北（+Y）
  <mesh position={[pos[0], pos[1], pos[2] + lift]} rotation={[0, 0, angleRad]} scale={[radius * 2, -radius * 2, 1]} material={faceMaterial(image, { blend: '半透明', ...materialOpts })}>
    <planeGeometry args={[1, 1]} />
  </mesh>
);
