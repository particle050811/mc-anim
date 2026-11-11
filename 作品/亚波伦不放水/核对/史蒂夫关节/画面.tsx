// 史蒂夫关节核对的画面：灰底、一块地面、一盏环境光加一盏平行光（同 核对/史蒂夫装备）。视图表在 视图.ts。
// 画布不开抗锯齿：史蒂夫的贴图没做 UV 内收（见 库/角色/史蒂夫.tsx）。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import { use当前秒 } from '@engine/段/时间.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { 反应史蒂夫 } from '../../角色/反应史蒂夫.tsx';
import { 蹲腿角 } from '../../角色/史蒂夫关节.ts';
import { 装备史蒂夫 } from '../../角色/史蒂夫装备.tsx';
import { 画幅, 视图在, type 人, type 视图 } from './视图.ts';

const 机位: React.FC<{ v: 视图 }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.视角;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(场景到three(v.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const 画人: React.FC<{ 人: 人 }> = ({ 人 }) => {
  if ('状态' in 人) return <反应史蒂夫 状态={人.状态} 装备={人.装备} />;
  const 拿剑 = 人.装备?.剑 !== false;
  const 腿 = 蹲腿角(人.膝);
  const pose = { ...stevePose(人.位, 180, { sec: 0, holdR: 拿剑 }), elbowR: 人.肘, elbowL: 人.肘, kneeR: 人.膝, kneeL: 人.膝, legR: 腿 + (人.迈 ?? 0), legL: 腿 - (人.迈 ?? 0), ground: 1 };
  return <装备史蒂夫 pose={pose} 秒={0.5} 装备={人.装备} 受伤={人.受伤} />;
};

const 画面: React.FC = () => {
  const { v, τ } = 视图在(use当前秒());
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: false }}>
        <color attach="background" args={['#5a5e66']} />
        <机位 v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[24, 24, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          {v.人们(τ).map((人, i) => (
            <画人 key={i} 人={人} />
          ))}
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
