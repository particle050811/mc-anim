// 正片台地场共用的画布：真下界（提亮那套光）+ 机位 + 屏幕 AO，孩子放在场景组里（Z 朝上，场景坐标），界面 叠在画面上。各幕的段只管摆人、摆机位。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { rigSpline, type Cam } from '@engine/core/机位.ts';
import { placeCamera } from '@engine/core/three换算.ts';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { netherBrighter, netherFarM, RealNether } from '../../地点/真下界.tsx';
import { altarBottomCut } from '../../地点/地形改动.ts';
import type { ExtraBlock } from '@engine/light/光体.ts';
import { soulFireCells, structureBlocks } from '../../特效/安息仪式时序.ts';
import { altar } from './布局.ts';

export const aspect = { width: 1280, height: 720 } as const;

const PlaceRig: React.FC<{ cameraRig: Cam }> = ({ cameraRig }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  // 远裁面至少 1400；远雾的 D 放大到再往外时跟着放（下界高差不到 128 格，D 外加 200 够）
  placeCamera(camera as THREE.PerspectiveCamera, cameraRig, aspect.width / aspect.height, { near: 0.05, far: Math.max(1400, netherFarM(netherBrighter) + 200) });
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

// 仪式结构是模型画的、不在地形里，光体看不见：四角的灵魂火照亮四周（用户 11-19「要，加上灵魂火光源」），结构的方块（含黑曜石底，补上挖掉的那层）挡光。
// 中间的哭泣黑曜石原版也发光（10 级），用户只要了灵魂火，光体里先当不发光的挡光块（Agent 取的）。
// 格 (i, j, k) 的方块占 x i−½～i+½（安息仪式.tsx 的拼搭原点 [−½, −½, 0]），放在祭坛上
const ritualLightBlocks: readonly ExtraBlock[] = [...structureBlocks(), ...soulFireCells.map((位) => ({ state: 'minecraft:soul_fire', 位 }))].map(({ state, 位 }) => ({
  pos: [altar[0] + 位[0] - 0.5, altar[1] + 位[1] - 0.5, altar[2] + 位[2]],
  state: state === 'minecraft:crying_obsidian' ? 'minecraft:obsidian' : state,
}));

/** 仪式结构：这一段画了安息仪式的结构（黑曜石底换掉那一层地面），地形要挖掉对应的格 */
export const TerraceCanvas: React.FC<{ cameraRig: Cam; children: React.ReactNode; ui?: React.ReactNode; ritualStructure?: boolean }> = ({ cameraRig, children, ui, ritualStructure = false }) => (
  <AbsoluteFill style={{ background: netherBrighter.fog.色 }}>
    <ThreeCanvas width={aspect.width} height={aspect.height} gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
      <PlaceRig cameraRig={cameraRig} />
      <ScreenAo />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <RealNether cameraPos={cameraRig.pos} 光={netherBrighter} carve={ritualStructure ? altarBottomCut : undefined} lightBlocks={ritualStructure ? ritualLightBlocks : undefined} />
        {children}
      </group>
    </ThreeCanvas>
    {ui}
  </AbsoluteFill>
);

/** 一幕里的镜头表：按段内秒切，机位是镜头内进度 u（0～1）的函数 */
export type Shot = { name: string; start: number; cameraRig: (u: number, sec: number) => Cam };
export const pickShot = (shotTable: readonly Shot[], sec: number, segLengthSec: number): { shot: Shot; cameraRig: Cam; shotSec: number } => {
  let i = 0;
  while (i + 1 < shotTable.length && sec >= shotTable[i + 1]!.start) i++;
  const shot = shotTable[i]!;
  const end = shotTable[i + 1]?.start ?? segLengthSec;
  const shotSec = sec - shot.start;
  return { shot, cameraRig: shot.cameraRig(Math.min(1, Math.max(0, shotSec / (end - shot.start))), shotSec), shotSec };
};
