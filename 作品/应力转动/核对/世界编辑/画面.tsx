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
import { use按版本的地形 } from './地形.ts';

const 包 = '测试-修整-岛-编辑示例';
const 版本 = 'a30f4b86f061';
const 原点 = [38912, 64, -2048];
const 场景 = (x: number, y: number, z: number) => [x - 原点[0], 原点[2] - z, y - 原点[1]];

const 机位: CamPose = { pos: 场景(39748, 92, -1176), tgt: 场景(39712, 67, -1226), lens: 24 };

const 地形: React.FC = () => {
  const t = use按版本的地形(包, 版本);
  if (!t) return null;
  if (t.原点.some((v, i) => v !== 原点[i])) throw new Error(`${包}/${版本} 的原点是 ${t.原点}，画面按 ${原点} 算的`);
  return <VoxelWorld 键={t.键} 来源={t.来源} 中心={机位.pos} 像素={LevelParams.视频.像素} 远={2000} 高度={t.高度} />;
};

const 画面: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
        <FlightFog visibility={3000} />
        <FlightRig c={机位} near={0.05} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <FlightSky camPos={机位.pos} />
          <地形 />
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

export default 画面;
