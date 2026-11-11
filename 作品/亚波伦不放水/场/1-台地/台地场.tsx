// 正片台地场共用的画布：真下界（提亮那套光）+ 机位 + 屏幕 AO，孩子放在场景组里（Z 朝上，场景坐标），界面 叠在画面上。各幕的段只管摆人、摆机位。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import type { Cam } from '@engine/core/机位.ts';
import { 场景到three, 摆相机 } from '@engine/core/three换算.ts';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { 下界提亮, 真下界 } from '../../地点/真下界.tsx';
import { 祭坛底挖 } from './布局.ts';

export const 画幅 = { 宽: 1280, 高: 720 } as const;

const 摆机位: React.FC<{ 机位: Cam }> = ({ 机位 }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  摆相机(camera as THREE.PerspectiveCamera, 机位, 画幅.宽 / 画幅.高, { 近: 0.05, 远: 1400 });
  return null;
};

/** 仪式结构：这一段画了安息仪式的结构（黑曜石底换掉那一层地面），地形要挖掉对应的格 */
export const 台地画布: React.FC<{ 机位: Cam; children: React.ReactNode; 界面?: React.ReactNode; 仪式结构?: boolean }> = ({ 机位, children, 界面, 仪式结构 = false }) => (
  <AbsoluteFill style={{ background: 下界提亮.雾.色 }}>
    <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
      <摆机位 机位={机位} />
      <ScreenAo />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <真下界 镜头={机位.pos} 光={下界提亮} 挖={仪式结构 ? 祭坛底挖 : undefined} />
        {children}
      </group>
    </ThreeCanvas>
    {界面}
  </AbsoluteFill>
);

/** 一幕里的镜头表：按段内秒切，机位是镜头内进度 u（0～1）的函数 */
export type 镜头 = { 名: string; 起: number; 机位: (u: number, 秒: number) => Cam };
export const 取镜头 = (表: readonly 镜头[], 秒: number, 段长: number): { 镜: 镜头; 机位: Cam; 镜内秒: number } => {
  let i = 0;
  while (i + 1 < 表.length && 秒 >= 表[i + 1]!.起) i++;
  const 镜 = 表[i]!;
  const 止 = 表[i + 1]?.起 ?? 段长;
  const 镜内秒 = 秒 - 镜.起;
  return { 镜, 机位: 镜.机位(Math.min(1, Math.max(0, 镜内秒 / (止 - 镜.起))), 镜内秒), 镜内秒 };
};

const 投影相机 = new THREE.PerspectiveCamera();
/** 场景里的一点落在画面上哪（像素，页面坐标）；前 = 在镜头前面 */
export const 投到画面 = (机位: Cam, 点: readonly number[]): { x: number; y: number; 前: boolean } => {
  摆相机(投影相机, 机位, 画幅.宽 / 画幅.高, { 近: 0.05, 远: 1400 });
  投影相机.updateMatrixWorld();
  投影相机.matrixWorldInverse.copy(投影相机.matrixWorld).invert();
  const v = 场景到three(点).project(投影相机);
  return { x: ((v.x + 1) / 2) * 画幅.宽, y: ((1 - v.y) / 2) * 画幅.高, 前: v.z < 1 };
};
