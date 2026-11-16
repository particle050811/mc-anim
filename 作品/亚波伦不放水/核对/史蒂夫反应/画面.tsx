// 史蒂夫反应核对的画面：灰底、一块地面、一盏环境光加一盏平行光（同 核对/史蒂夫装备），史蒂夫站在原点面朝南。视图表在 视图.ts。
// 画布不开抗锯齿：史蒂夫的贴图没做 UV 内收（见 库/角色/史蒂夫.tsx）。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { useViewIndex } from '@engine/段/时间.tsx';
import { Arrow } from '@库/物品/箭.tsx';
import { deathPoof, VanillaParticles } from '@库/特效/原版粒子.tsx';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { arrowLaunchPoint, arrowFlight } from '../../角色/史蒂夫反应.ts';
import { steveDrops, steveDropCount, DeathDrop, deathDropTrack } from '../../角色/史蒂夫掉落.tsx';
import { TotemParticles, totemParticleTable } from '../../特效/图腾粒子.tsx';
import { aspect, views, type View } from './视图.ts';

const CameraRig: React.FC<{ v: View }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.fov;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(sceneToThree(v.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const originPos: V3 = [0, 0, 0];

const SceneView: React.FC<{ v: View }> = ({ v }) => {
  const totemTable = useMemo(() => totemParticleTable(originPos, 1, { ground: 0 }), []);
  const trajectory = useMemo(() => deathDropTrack(originPos, steveDropCount, 3), []);
  const whiteSmoke = useMemo(() => deathPoof(originPos, 0.6, 1.8, 0, 5), []);
  const sinceDeath = v.state.afterDeathSec;
  const arrow = v.arrowSec === undefined || !v.state.看 ? null : arrowFlight(arrowLaunchPoint(originPos), [v.state.看[0], v.state.看[1], v.state.看[2] - arrowLaunchPoint(originPos)[2]], 1, v.arrowSec);
  return (
    <>
      <ReactingSteve state={{ 位置: originPos, facing: 180, ...v.state }} />
      {arrow && <Arrow p={arrow.p} dir={arrow.dir} />}
      {v.totemSec !== undefined && <TotemParticles 表={totemTable} sec={v.totemSec} />}
      {sinceDeath !== undefined && (
        <>
          <DeathDrop trajectory={trajectory} drops={steveDrops(sinceDeath)} sec={sinceDeath} />
          <VanillaParticles spawns={whiteSmoke} sec={sinceDeath} />
        </>
      )}
    </>
  );
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={aspect.width} height={aspect.height} gl={{ antialias: false }}>
        <color attach="background" args={['#5a5e66']} />
        <CameraRig v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[16, 16, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          <SceneView v={v} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.name}</div>
        {v.note && <div style={{ fontSize: 16 }}>{v.note}</div>}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
