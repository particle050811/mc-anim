// 核对-真下界的画面：机位照视图表，地形、灯、雾都是 地点/真下界.tsx 的，这里只摆机位、加屏幕 AO、左上角写视图名。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { sceneToThree } from '@engine/core/three换算.ts';
import { useViewIndex } from '@engine/段/时间.tsx';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { netherVanilla, netherBrighter, RealNether } from '../../地点/真下界.tsx';
import { aspect, views, type View } from './视图.ts';

const lightTables = { 原版: netherVanilla, 提亮: netherBrighter };

const CameraRig: React.FC<{ v: View }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = 70;
  cam.aspect = aspect.width / aspect.height;
  cam.near = 0.05;
  cam.far = 4096;
  cam.position.copy(sceneToThree(v.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const lightSetup = lightTables[v.光];
  return (
    <AbsoluteFill style={{ background: lightSetup.fog.色 }}>
      <ThreeCanvas width={aspect.width} height={aspect.height} gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
        <CameraRig v={v} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <RealNether cameraPos={v.眼} 光={lightSetup} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.name}</div>
        <div style={{ fontSize: 16 }}>{`眼 场景 ${v.眼.map((n) => n.toFixed(1)).join(', ')}；雾 ${lightSetup.fog.near}～${lightSetup.fog.far} 格`}</div>
      </div>
    </AbsoluteFill>
  );
};

export default picture;
