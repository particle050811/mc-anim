// 核对-法术录制 的画面：三格同一个场景（照 核对-法术演出：灰底、地面、目标处的史蒂夫、起点的小白球），只换法术的画法，见 视图.ts。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import { png, type Png } from '@engine/model/贴图.ts';
import { use当前秒 } from '@engine/段/时间.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { 法术演出 } from '../../法术/演出/注册表.tsx';
import { 录制回放, 读录制, type 法术录制 } from '../../法术/演出/零件/录制回放.tsx';
import { 格, 画幅, 目标, 种子, 视图在, 起点, type 机位 } from './视图.ts';
import 录弱化 from 'asset:录制/法术/goety/weakening';
import 录霜冻新星 from 'asset:录制/法术/goety/frost_nova';
import 环 from 'asset:贴图/法术/goety/particle/shockwave';
import 拖尾 from 'asset:贴图/法术/goety/particle/trail';
import 霜1 from 'asset:贴图/法术/goety/particle/frost_1';
import 霜2 from 'asset:贴图/法术/goety/particle/frost_2';
import 霜3 from 'asset:贴图/法术/goety/particle/frost_3';
import 霜4 from 'asset:贴图/法术/goety/particle/frost_4';
import 霜5 from 'asset:贴图/法术/goety/particle/frost_5';
import 霜6 from 'asset:贴图/法术/goety/particle/frost_6';

const 录制们: Record<string, 法术录制> = { weakening: 读录制(录弱化), frost_nova: 读录制(录霜冻新星) };
const 贴图表: Record<string, Png> = {
  'goety:shockwave': png(环),
  'goety:trail': png(拖尾),
  ...Object.fromEntries([霜1, 霜2, 霜3, 霜4, 霜5, 霜6].map((x, i) => [`goety:frost_${i + 1}`, png(x)])),
};

const 设机位: React.FC<{ v: 机位 }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.视角;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(场景到three([...v.眼]));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three([...v.看]));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

type 画法 = '手写' | '录制·轨' | '录制·算';

const 一格: React.FC<{ 画法: 画法 }> = ({ 画法 }) => {
  const v = 视图在(use当前秒());
  const 录 = 录制们[v.元.id]!;
  const 脚底 = [起点[0], 起点[1], 起点[2] - v.起点高] as const;
  return (
    <div style={{ position: 'relative', width: 格.宽, height: 格.高 }}>
      <ThreeCanvas width={格.宽} height={格.高} gl={{ antialias: false }}>
        <color attach="background" args={['#5a5e66']} />
        <设机位 v={v.机位} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[160, 160, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          <Steve pose={stevePose([目标[0], 目标[1], 目标[2]], 90)} mcLight={1} hurt={0} />
          <mesh position={[起点[0], 起点[1], 起点[2]]}>
            <sphereGeometry args={[0.08, 12, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {画法 === '手写' ? (
            <法术演出 id={v.元.id} 秒={v.秒} 起点={起点} 目标={目标} 种子={种子} />
          ) : (
            <录制回放 录制={录} 秒={v.秒} 脚底={脚底} 目标={目标} 贴图={贴图表} 动法={画法 === '录制·算' ? '算' : '轨'} />
          )}
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 12, top: 8, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 20, textShadow: '0 1px 3px #000' }}>{画法}</div>
    </div>
  );
};

const 画面: React.FC = () => {
  const v = 视图在(use当前秒());
  return (
    <AbsoluteFill style={{ background: '#5a5e66', width: 画幅.宽, height: 画幅.高 }}>
      <div style={{ display: 'flex' }}>
        <一格 画法="手写" />
        <一格 画法="录制·轨" />
        <一格 画法="录制·算" />
      </div>
      <div style={{ position: 'absolute', left: 12, bottom: 8, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 18, textShadow: '0 1px 3px #000' }}>
        {v.元.id}　{v.机位.名}　出手后 {v.秒.toFixed(2)} 秒（第 {(v.秒 * 20).toFixed(1)} 刻）／长秒 {v.长秒.toFixed(2)}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
