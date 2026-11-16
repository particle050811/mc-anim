// 核对-法术演出 的画面：灰底、一块地面，史蒂夫站在目标处面朝起点，起点放一个小白球当标记（核对用，不是法术的一部分）。视图怎么排见 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
// 画布不开抗锯齿：史蒂夫没做 UV 内收（见 @库/角色/史蒂夫.tsx）。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { SpellPerformance } from '../../法术/演出/注册表.tsx';
import { spellTable } from '../../法术/法术表.ts';
import { slotSec, target, aspect, seed, viewAt, castFrom, type CameraRig } from './视图.ts';

const chineseNames = new Map(spellTable.map((spell) => [spell.registryName, spell.chineseName]));

const ApplyRig: React.FC<{ v: CameraRig }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.fov;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(sceneToThree([...v.眼]));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree([...v.看]));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const picture: React.FC = () => {
  const segSec = useCurrentSec();
  const v = viewAt(segSec);
  const hurt = v.hitSec !== undefined && v.sec >= v.hitSec && v.sec < v.hitSec + 0.5;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={aspect.width} height={aspect.height} gl={{ antialias: false }}>
        <color attach="background" args={['#5a5e66']} />
        <ApplyRig v={v.cameraRig} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[160, 160, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          {/* 史蒂夫面朝西看着起点（yaw 正 = 往左转，0 朝 +Y）；命中后半秒变红（原版受击红 10 刻） */}
          <Steve pose={stevePose([target[0], target[1], target[2]], 90)} mcLight={1} hurt={hurt ? 1 : 0} />
          <mesh position={[castFrom[0], castFrom[1], castFrom[2]]}>
            <sphereGeometry args={[0.08, 12, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <SpellPerformance id={v.meta.id} sec={v.sec} from={castFrom} target={target} seed={seed} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>
          第 {v.slotIndex + 1} 个　{chineseNames.get(v.meta.id) ?? ''}（{v.meta.id}）　{v.cameraRig.name}
        </div>
        <div style={{ fontSize: 16 }}>
          出手后 {v.sec.toFixed(2)} 秒（第 {(v.sec * 20).toFixed(1)} 刻）／全长 {v.长秒.toFixed(2)} 秒{v.hitSec === undefined ? '' : `　命中在 ${v.hitSec.toFixed(2)} 秒`}　槽起帧 {v.slotIndex * slotSec * 60}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default picture;
