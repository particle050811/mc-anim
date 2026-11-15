// 世界编辑核对的画面：区段包 测试-修整-岛-编辑示例（原点 38912, 64, -2048）里基地小岛中间那块地，镜头在东南方斜上。
// 场景坐标 X = x − 38912，Y = −2048 − z，Z = y − 64。石台 x 39690～39710、z −1230～−1210、y 66；玻璃房 39694～39706 和东边复制的 39720～39732；石亭在 (39704, 66, −1245) 起。
// 包重烘了版本会变：anim world bake 测试-修整-编辑示例 报的版本抄到 版本 这里（本段指纹跟着变，别的段不受影响）。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { canvasDpr, LevelParams } from '@engine/core/渲染级别.ts';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { VoxelWorld } from '@engine/voxel/世界.tsx';
import { FlightFog, FlightRig, FlightSky, type CamPose } from '../../地点/飞行镜头.tsx';
import { useVersionedTerrain } from './地形.ts';

const pack = '测试-修整-岛-编辑示例';
const terrainVersion = 'e02fae21f596';
const originPos = [38912, 64, -2048];
const toScene = (x: number, y: number, z: number) => [x - originPos[0], originPos[2] - z, y - originPos[1]];

const cameraRig: CamPose = { pos: toScene(39748, 92, -1176), tgt: toScene(39712, 67, -1226), lens: 24 };

const Terrain: React.FC = () => {
  const t = useVersionedTerrain(pack, terrainVersion);
  if (!t) return null;
  if (t.原点.some((v, i) => v !== originPos[i])) throw new Error(`${pack}/${terrainVersion} 的原点是 ${t.原点}，画面按 ${originPos} 算的`);
  return <VoxelWorld 键={t.键} 来源={t.来源} 中心={cameraRig.pos} pixel={LevelParams.视频.pixel} far={2000} heightRange={t.heightRange} />;
};

const picture: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
        <FlightFog visibility={3000} />
        <FlightRig c={cameraRig} near={0.05} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <FlightSky camPos={cameraRig.pos} />
          <Terrain />
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

export default picture;
