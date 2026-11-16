// 史蒂夫关节核对的画面：灰底、一块地面、一盏环境光加一盏平行光（同 核对/史蒂夫装备）。视图表在 视图.ts。
// 画布不开抗锯齿：史蒂夫的贴图没做 UV 内收（见 库/角色/史蒂夫.tsx）。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { squatLegAngle } from '../../角色/史蒂夫关节.ts';
import { EquippedSteve } from '../../角色/史蒂夫装备.tsx';
import { aspect, viewAt, type Person, type View } from './视图.ts';

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

const DrawPerson: React.FC<{ 人: Person }> = ({ 人: person }) => {
  if ('state' in person) return <ReactingSteve state={person.state} equipment={person.equipment} />;
  const holdSword = person.equipment?.剑 !== false;
  const legPitch = squatLegAngle(person.knee);
  const pose = { ...stevePose(person.位, 180, { sec: 0, holdR: holdSword }), elbowR: person.elbow, elbowL: person.elbow, kneeR: person.knee, kneeL: person.knee, legR: legPitch + (person.stride ?? 0), legL: legPitch - (person.stride ?? 0), ground: 1 };
  return <EquippedSteve pose={pose} sec={0.5} equipment={person.equipment} hurt={person.hurt} />;
};

const picture: React.FC = () => {
  const { v, τ } = viewAt(useCurrentSec());
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={aspect.width} height={aspect.height} gl={{ antialias: false }}>
        <color attach="background" args={['#5a5e66']} />
        <CameraRig v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[24, 24, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          {v.people(τ).map((person, i) => (
            <DrawPerson key={i} 人={person} />
          ))}
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
