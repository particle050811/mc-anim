// 核对-法术演出 的画面：灰底、一块地面，史蒂夫站在目标处面朝起点，起点放一个小白球当标记（核对用，不是法术的一部分）。视图怎么排见 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
// 画布不开抗锯齿：史蒂夫没做 UV 内收（见 @库/角色/史蒂夫.tsx）。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import { use当前秒 } from '@engine/段/时间.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { 法术演出 } from '../../法术/演出/注册表.tsx';
import { 法术表 } from '../../法术/法术表.ts';
import { 每槽秒, 目标, 画幅, 种子, 视图在, 起点, type 机位 } from './视图.ts';

const 中文名 = new Map(法术表.map((法) => [法.注册名, 法.中文名]));

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

const 画面: React.FC = () => {
  const 段秒 = use当前秒();
  const v = 视图在(段秒);
  const 受击 = v.命中秒 !== undefined && v.秒 >= v.命中秒 && v.秒 < v.命中秒 + 0.5;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: false }}>
        <color attach="background" args={['#5a5e66']} />
        <设机位 v={v.机位} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[160, 160, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          {/* 史蒂夫面朝西看着起点（yaw 正 = 往左转，0 朝 +Y）；命中后半秒变红（原版受击红 10 刻） */}
          <Steve pose={stevePose([目标[0], 目标[1], 目标[2]], 90)} mcLight={1} hurt={受击 ? 1 : 0} />
          <mesh position={[起点[0], 起点[1], 起点[2]]}>
            <sphereGeometry args={[0.08, 12, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <法术演出 id={v.元.id} 秒={v.秒} 起点={起点} 目标={目标} 种子={种子} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>
          第 {v.第几个 + 1} 个　{中文名.get(v.元.id) ?? ''}（{v.元.id}）　{v.机位.名}
        </div>
        <div style={{ fontSize: 16 }}>
          出手后 {v.秒.toFixed(2)} 秒（第 {(v.秒 * 20).toFixed(1)} 刻）／全长 {v.长秒.toFixed(2)} 秒{v.命中秒 === undefined ? '' : `　命中在 ${v.命中秒.toFixed(2)} 秒`}　槽起帧 {v.第几个 * 每槽秒 * 60}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
