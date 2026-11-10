// 粉色教堂核对的画面：教堂网格加它自己的灯，视图表在 视图.ts。天空是一块纯色（整合包里教堂在飞升后的独立空间，天是什么样没核实，Agent 暂定淡蓝）。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import { use视图下标 } from '@engine/段/时间.tsx';
import { 娘化亚波伦, 站立 } from '../../角色/娘化亚波伦.tsx';
import { 教堂, 教堂灯光, 粉色教堂 } from '../../地点/粉色教堂.tsx';
import { 画幅, 视图们, type 视图 } from './视图.ts';

const 天色 = '#b4cfff';

const 机位: React.FC<{ v: 视图 }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.视角;
  cam.near = 0.05;
  cam.far = 512;
  cam.position.copy(场景到three(v.眼));
  cam.up.copy(v.上 ? 场景到three(v.上) : new THREE.Vector3(0, 1, 0));
  cam.lookAt(场景到three(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  return (
    <AbsoluteFill style={{ background: 天色 }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }}>
        <color attach="background" args={[天色]} />
        <机位 v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <教堂灯光 />
          <粉色教堂 />
          {v.亚波伦 && <娘化亚波伦 pose={{ loc: 教堂.跳舞位, yaw: 180 }} 秒={0.5} 表演={站立} />}
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        {v.说明 && <div style={{ fontSize: 16 }}>{v.说明}</div>}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
