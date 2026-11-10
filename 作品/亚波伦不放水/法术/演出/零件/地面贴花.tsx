// 地面贴花：平铺在地上的一张贴图（预警圈 AoEParticle、冲击波环 ShockwaveParticle、法阵这类贴地的方片）。
// 游戏里这类粒子画在地面上方一点点（各类自己加 0.01～0.1 格），这里默认抬 0.02 格免得和地面抢深度。
import React from 'react';
import type { Png } from '@engine/model/贴图.ts';
import type { 点 } from '../接口.ts';
import { 面材质, type 面材质选项 } from './材质.ts';

export const 地面贴花: React.FC<
  面材质选项 & {
    /** 中心（落在地面上的点） */
    位: 点;
    图: Png | null;
    /** 半边长（格） */
    半径: number;
    /** 绕竖直轴转的弧度 */
    转角?: number;
    抬高?: number;
  }
> = ({ 位, 图, 半径, 转角 = 0, 抬高 = 0.02, ...材 }) => (
  // planeGeometry 在 XY 平面、法线 +Z，场景 Z 朝上，正好平躺；贴图第一行朝北（+Y）
  <mesh position={[位[0], 位[1], 位[2] + 抬高]} rotation={[0, 0, 转角]} scale={[半径 * 2, -半径 * 2, 1]} material={面材质(图, { 混合: '半透明', ...材 })}>
    <planeGeometry args={[1, 1]} />
  </mesh>
);
