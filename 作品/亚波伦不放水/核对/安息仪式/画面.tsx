// 安息仪式核对的画面：暗红底（下界的雾色）、一块下界岩色的地，结构摆在原点。视图表在 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import { useViewIndex } from '@engine/段/时间.tsx';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { RestRitualPerformance, RestRitualStructure, Offering } from '../../特效/安息仪式.tsx';
import { summonStateAt, appearPos, offerings, offeringPos, transitionProgressTick } from '../../特效/安息仪式时序.ts';
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

const background = '#3a0a07';
const Ground: React.FC = () => (
  <mesh position={[0, 0, -0.06]}>
    <boxGeometry args={[160, 160, 0.1]} />
    <meshStandardMaterial color="#5a2422" />
  </mesh>
);

// 核对里静止的视图也让火和物品停在一个固定的时刻
const stillSec = 0.4;

const Content: React.FC<{ v: View }> = ({ v }) => {
  if (v.pictureMode.类 === '陈列') {
    return (
      <>
        {offerings.map((offering, i) => (
          <group key={offering.名} position={[((i % 6) - 2.5) * 1.5, 0, i < 6 ? 2.4 : 0.8]} scale={2}>
            <Offering 名={offering.名} 秒={0} />
          </group>
        ))}
      </>
    );
  }
  if (v.pictureMode.类 === '结构') {
    return (
      <>
        <Ground />
        <RestRitualStructure 秒={stillSec} />
        {offerings.map((offering, i) => (
          <group key={offering.名} position={offeringPos(i)}>
            <Offering 名={offering.名} 秒={stillSec} />
          </group>
        ))}
      </>
    );
  }
  return (
    <>
      <Ground />
      <RestRitualPerformance 秒={v.pictureMode.秒} plan={v.pictureMode.plan}>
        <GirlYaBoLun pose={{ loc: [...appearPos], yaw: 180 }} 秒={v.pictureMode.秒 - v.pictureMode.plan.appear} />
      </RestRitualPerformance>
    </>
  );
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const s = v.pictureMode.类 === '演出' ? summonStateAt(v.pictureMode.秒, v.pictureMode.plan) : undefined;
  return (
    <AbsoluteFill style={{ background: background }}>
      <ThreeCanvas width={aspect.宽} height={aspect.高} gl={{ antialias: false }}>
        <color attach="background" args={[background]} />
        <CameraRig v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.6 * Math.PI} />
          <directionalLight position={[3, -4, 6]} intensity={0.5 * Math.PI} />
          <Content v={v} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        {v.说明 && <div style={{ fontSize: 16 }}>{v.说明}</div>}
        {s && v.pictureMode.类 === '演出' && (
          <div style={{ fontSize: 16 }}>
            第 {v.pictureMode.秒.toFixed(2)} 秒（共 {v.pictureMode.plan.总秒} 秒）　阶段 {s.阶段}　祭品 {s.offeringAlpha.toFixed(2)}　相当于游戏过渡第 {transitionProgressTick(v.pictureMode.秒, v.pictureMode.plan).toFixed(0)} 刻　法阵半边 {s.circleHalf.toFixed(2)}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
