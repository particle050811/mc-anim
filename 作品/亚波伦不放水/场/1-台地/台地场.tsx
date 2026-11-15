// 正片台地场共用的画布：真下界（提亮那套光）+ 机位 + 屏幕 AO，孩子放在场景组里（Z 朝上，场景坐标），界面 叠在画面上。各幕的段只管摆人、摆机位。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { rigSpline, type Cam } from '@engine/core/机位.ts';
import { sceneToThree, placeCamera } from '@engine/core/three换算.ts';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { netherBrighter, RealNether } from '../../地点/真下界.tsx';
import { altarBottomCut } from '../../地点/地形改动.ts';

export const aspect = { 宽: 1280, 高: 720 } as const;

const PlaceRig: React.FC<{ cameraRig: Cam }> = ({ cameraRig }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  placeCamera(camera as THREE.PerspectiveCamera, cameraRig, aspect.宽 / aspect.高, { near: 0.05, far: 1400 });
  return null;
};

/** 跟拍：镜头里每隔约 步 秒按那一刻人在哪摆一个机位（摆(镜内秒, 进度)），连成速度连续的样条，镜头跟着动作走。镜头长 长 秒 */
export const followShot = (lengthSec: number, cameraPath: (shotSec: number, k: number) => Cam, stepSec = 0.25): Shot['cameraRig'] => {
  const n = Math.max(1, Math.ceil(lengthSec / stepSec));
  const keyframes = Array.from({ length: n + 1 }, (_, i) => {
    const s = (lengthSec * i) / n;
    return [s, cameraPath(s, i / n)] as const;
  });
  return (_u, s) => rigSpline(keyframes, s);
};

/** 仪式结构：这一段画了安息仪式的结构（黑曜石底换掉那一层地面），地形要挖掉对应的格 */
export const TerraceCanvas: React.FC<{ cameraRig: Cam; children: React.ReactNode; ui?: React.ReactNode; ritualStructure?: boolean }> = ({ cameraRig, children, ui, ritualStructure = false }) => (
  <AbsoluteFill style={{ background: netherBrighter.fog.色 }}>
    <ThreeCanvas width={aspect.宽} height={aspect.高} gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
      <PlaceRig cameraRig={cameraRig} />
      <ScreenAo />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <RealNether cameraPos={cameraRig.pos} 光={netherBrighter} carve={ritualStructure ? altarBottomCut : undefined} />
        {children}
      </group>
    </ThreeCanvas>
    {ui}
  </AbsoluteFill>
);

/** 一幕里的镜头表：按段内秒切，机位是镜头内进度 u（0～1）的函数 */
export type Shot = { 名: string; 起: number; cameraRig: (u: number, sec: number) => Cam };
export const pickShot = (shotTable: readonly Shot[], sec: number, segLengthSec: number): { shot: Shot; cameraRig: Cam; shotSec: number } => {
  let i = 0;
  while (i + 1 < shotTable.length && sec >= shotTable[i + 1]!.起) i++;
  const shot = shotTable[i]!;
  const end = shotTable[i + 1]?.起 ?? segLengthSec;
  const shotSec = sec - shot.起;
  return { shot, cameraRig: shot.cameraRig(Math.min(1, Math.max(0, shotSec / (end - shot.起))), shotSec), shotSec };
};

const projCamera = new THREE.PerspectiveCamera();
/** 场景里的一点落在画面上哪（像素，页面坐标）；前 = 在镜头前面 */
export const projectToPicture = (cameraRig: Cam, point: readonly number[]): { x: number; y: number; 前: boolean } => {
  placeCamera(projCamera, cameraRig, aspect.宽 / aspect.高, { near: 0.05, far: 1400 });
  projCamera.updateMatrixWorld();
  projCamera.matrixWorldInverse.copy(projCamera.matrixWorld).invert();
  const v = sceneToThree(point).project(projCamera);
  return { x: ((v.x + 1) / 2) * aspect.宽, y: ((1 - v.y) / 2) * aspect.高, 前: v.z < 1 };
};
