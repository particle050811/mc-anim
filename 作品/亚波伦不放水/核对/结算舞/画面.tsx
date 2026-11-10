// 结算舞核对的画面：前半灰底加一块地面（同 核对-娘化亚波伦 的灯），后半粉色教堂跳舞位；机位见 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { use当前秒 } from '@engine/段/时间.tsx';
import { 教堂, 教堂灯光, 粉色教堂 } from '../../地点/粉色教堂.tsx';
import { 忘情牛肉面姿势, 忘情牛肉面环境 } from '../../角色/动作/忘情牛肉面.ts';
import { 娘化亚波伦, 定表演 } from '../../角色/娘化亚波伦.tsx';
import { 教堂机位, 每半秒, 正面, 画幅 } from './视图.ts';

// idle 垫底（呼吸、眨眼、浮块自转照旧），舞的姿势盖在上面；头发、胸部的弹簧吃舞里的转身和起落速度
const 跳舞 = 定表演({ 主: () => [{ 名: 'idle' }], 环境: 忘情牛肉面环境 });

const 底色 = '#5a5e66';
const 天色 = '#b4cfff';
const 加 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const 机位: React.FC<{ 眼: V3; 看: V3; 视角: number }> = ({ 眼, 看, 视角 }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = 视角;
  cam.near = 0.05;
  cam.far = 512;
  cam.position.copy(场景到three(眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three(看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const 画面: React.FC = () => {
  const 段秒 = use当前秒();
  const 在教堂 = 段秒 >= 每半秒;
  const 秒 = 在教堂 ? 段秒 - 每半秒 : 段秒;
  const 姿势 = 忘情牛肉面姿势(秒);
  const 色 = 在教堂 ? 天色 : 底色;
  return (
    <AbsoluteFill style={{ background: 色 }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }}>
        <color attach="background" args={[色]} />
        {在教堂 ? (
          <机位 眼={加(教堂.跳舞位, 教堂机位.眼偏)} 看={加(教堂.跳舞位, 教堂机位.看偏)} 视角={教堂机位.视角} />
        ) : (
          <机位 {...正面} />
        )}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {在教堂 ? (
            <>
              <教堂灯光 />
              <粉色教堂 />
            </>
          ) : (
            <>
              <ambientLight intensity={0.55 * Math.PI} />
              <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
              <mesh position={[0, 0, -0.05]}>
                <boxGeometry args={[12, 12, 0.1]} />
                <meshStandardMaterial color="#8a8f98" />
              </mesh>
            </>
          )}
          <娘化亚波伦 pose={{ loc: 在教堂 ? 教堂.跳舞位 : [0, 0, 0], yaw: 180 }} 秒={秒} 表演={跳舞} 姿势={姿势} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 26, textShadow: '0 1px 3px #000' }}>
        忘情牛肉面 {秒.toFixed(2)} 秒{在教堂 ? '（教堂跳舞位）' : ''}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
