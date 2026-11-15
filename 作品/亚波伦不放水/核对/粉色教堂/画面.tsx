// 粉色教堂核对的画面：教堂网格加它自己的灯，视图表在 视图.ts。天空是一块纯色（整合包里教堂在飞升后的独立空间，天是什么样没核实，Agent 暂定淡蓝）。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import { useViewIndex } from '@engine/段/时间.tsx';
import { GirlYaBoLun, stand } from '../../角色/娘化亚波伦.tsx';
import { church, ChurchLighting, PinkChurch } from '../../地点/粉色教堂.tsx';
import { aspect, views, type View } from './视图.ts';

const skyColor = '#b4cfff';

const CameraRig: React.FC<{ v: View }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.fov;
  cam.near = 0.05;
  cam.far = 512;
  cam.position.copy(sceneToThree(v.眼));
  cam.up.copy(v.上 ? sceneToThree(v.上) : new THREE.Vector3(0, 1, 0));
  cam.lookAt(sceneToThree(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  return (
    <AbsoluteFill style={{ background: skyColor }}>
      <ThreeCanvas width={aspect.宽} height={aspect.高} gl={{ antialias: true }}>
        <color attach="background" args={[skyColor]} />
        <CameraRig v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ChurchLighting />
          <PinkChurch />
          {v.yaBoLun && <GirlYaBoLun pose={{ loc: church.dancePos, yaw: 180 }} 秒={0.5} act={stand} />}
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        {v.说明 && <div style={{ fontSize: 16 }}>{v.说明}</div>}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
