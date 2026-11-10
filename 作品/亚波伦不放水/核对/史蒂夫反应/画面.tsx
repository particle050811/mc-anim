// 史蒂夫反应核对的画面：灰底、一块地面、一盏环境光加一盏平行光（同 核对/史蒂夫装备），史蒂夫站在原点面朝南。视图表在 视图.ts。
// 画布不开抗锯齿：史蒂夫的贴图没做 UV 内收（见 库/角色/史蒂夫.tsx）。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { use视图下标 } from '@engine/段/时间.tsx';
import { Arrow } from '@库/物品/箭.tsx';
import { deathPoof, VanillaParticles } from '@库/特效/原版粒子.tsx';
import { 反应史蒂夫 } from '../../角色/反应史蒂夫.tsx';
import { 出箭点, 箭飞行 } from '../../角色/史蒂夫反应.ts';
import { 史蒂夫掉落件, 史蒂夫掉落件数, 死亡掉落, 死亡掉落轨迹 } from '../../角色/史蒂夫掉落.tsx';
import { 图腾粒子, 图腾粒子表 } from '../../特效/图腾粒子.tsx';
import { 画幅, 视图们, type 视图 } from './视图.ts';

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

const 原点: V3 = [0, 0, 0];

const 场: React.FC<{ v: 视图 }> = ({ v }) => {
  const 图腾表 = useMemo(() => 图腾粒子表(原点, 1, { 地面: 0 }), []);
  const 轨迹 = useMemo(() => 死亡掉落轨迹(原点, 史蒂夫掉落件数, 3), []);
  const 白烟 = useMemo(() => deathPoof(原点, 0.6, 1.8, 0, 5), []);
  const 死 = v.状态.死后秒;
  const 箭 = v.箭秒 === undefined || !v.状态.看 ? null : 箭飞行(出箭点(原点), [v.状态.看[0], v.状态.看[1], v.状态.看[2] - 出箭点(原点)[2]], 1, v.箭秒);
  return (
    <>
      <反应史蒂夫 状态={{ 位置: 原点, 朝向: 180, ...v.状态 }} />
      {箭 && <Arrow p={箭.p} dir={箭.dir} />}
      {v.图腾秒 !== undefined && <图腾粒子 表={图腾表} 秒={v.图腾秒} />}
      {死 !== undefined && (
        <>
          <死亡掉落 轨迹={轨迹} 件={史蒂夫掉落件(死)} 秒={死} />
          <VanillaParticles spawns={白烟} 秒={死} />
        </>
      )}
    </>
  );
};

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: false }}>
        <color attach="background" args={['#5a5e66']} />
        <机位 v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[16, 16, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          <场 v={v} />
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
