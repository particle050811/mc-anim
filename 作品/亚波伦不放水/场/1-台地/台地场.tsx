// 正片台地场共用的画布：真下界（提亮那套光）+ 机位 + 屏幕 AO，孩子放在场景组里（Z 朝上，场景坐标），界面 叠在画面上。各幕的段只管摆人、摆机位。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import type { Cam } from '@engine/core/机位.ts';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { netherBrighter, RealNether } from '../../地点/真下界.tsx';
import { altarBottomCut } from '../../地点/地形改动.ts';
import type { ExtraBlock } from '@engine/light/光体.ts';
import { soulFireCells, structureBlocks } from '../../特效/安息仪式时序.ts';
import { altar } from './布局.ts';
import { aspect, placeTerraceCamera } from './台地机位.ts';

export { aspect, followShot, pickShot, type Shot } from './台地机位.ts';

const PlaceRig: React.FC<{ cameraRig: Cam }> = ({ cameraRig }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  placeTerraceCamera(camera as THREE.PerspectiveCamera, cameraRig);
  return null;
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
