// 核对-真下界的画面：机位照视图表，地形、灯、雾都是 地点/真下界.tsx 的，这里只摆机位、加屏幕 AO、左上角写视图名。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { 场景到three } from '@engine/core/three换算.ts';
import { use视图下标 } from '@engine/段/时间.tsx';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { 下界原版, 下界提亮, 真下界 } from '../../地点/真下界.tsx';
import { 画幅, 视图们, type 视图 } from './视图.ts';

const 光表 = { 原版: 下界原版, 提亮: 下界提亮 };

const 机位: React.FC<{ v: 视图 }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = 70;
  cam.aspect = 画幅.宽 / 画幅.高;
  cam.near = 0.05;
  cam.far = 4096;
  cam.position.copy(场景到three(v.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  const 光 = 光表[v.光];
  return (
    <AbsoluteFill style={{ background: 光.雾.色 }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
        <机位 v={v} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <真下界 镜头={v.眼} 光={光} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        <div style={{ fontSize: 16 }}>{`眼 场景 ${v.眼.map((n) => n.toFixed(1)).join(', ')}；雾 ${光.雾.近}～${光.雾.远} 格`}</div>
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
