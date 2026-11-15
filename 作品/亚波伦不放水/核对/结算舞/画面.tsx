// 结算舞核对的画面：前半灰底加一块地面（同 核对-娘化亚波伦 的灯），后半粉色教堂跳舞位；机位见 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { church, ChurchLighting, PinkChurch } from '../../地点/粉色教堂.tsx';
import { noodleDancePose, noodleDanceEnv } from '../../角色/动作/忘情牛肉面.ts';
import { GirlYaBoLun, defineAct } from '../../角色/娘化亚波伦.tsx';
import { chapelRig, halfSec, front, aspect } from './视图.ts';

// idle 垫底（呼吸、眨眼、浮块自转照旧），舞的姿势盖在上面；头发、胸部的弹簧吃舞里的转身和起落速度
const dance = defineAct({ 主: () => [{ 名: 'idle' }], 环境: noodleDanceEnv });

const baseColor = '#5a5e66';
const skyColor = '#b4cfff';
const addVec = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const CameraRig: React.FC<{ 眼: V3; 看: V3; fov: number }> = ({ 眼: eye, 看: lookAt, fov }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = fov;
  cam.near = 0.05;
  cam.far = 512;
  cam.position.copy(sceneToThree(eye));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(lookAt));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const picture: React.FC = () => {
  const segSec = useCurrentSec();
  const inChapel = segSec >= halfSec;
  const sec = inChapel ? segSec - halfSec : segSec;
  const bonePose = noodleDancePose(sec);
  const bgColor = inChapel ? skyColor : baseColor;
  return (
    <AbsoluteFill style={{ background: bgColor }}>
      <ThreeCanvas width={aspect.宽} height={aspect.高} gl={{ antialias: true }}>
        <color attach="background" args={[bgColor]} />
        {inChapel ? (
          <CameraRig 眼={addVec(church.dancePos, chapelRig.eyeOffset)} 看={addVec(church.dancePos, chapelRig.lookOffset)} fov={chapelRig.fov} />
        ) : (
          <CameraRig {...front} />
        )}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {inChapel ? (
            <>
              <ChurchLighting />
              <PinkChurch />
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
          <GirlYaBoLun pose={{ loc: inChapel ? church.dancePos : [0, 0, 0], yaw: 180 }} 秒={sec} act={dance} bonePose={bonePose} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 26, textShadow: '0 1px 3px #000' }}>
        忘情牛肉面 {sec.toFixed(2)} 秒{inChapel ? '（教堂跳舞位）' : ''}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
