// 炼狱结界核对的画面：灰底（或暗红底带雾，视图的 底）、一块地面，史蒂夫站在原点，演出视图里亚波伦悬在西边空中。视图表在 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
// 画布不开抗锯齿：史蒂夫没做 UV 内收（见 @库/角色/史蒂夫.tsx），游戏里的线也没有抗锯齿。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import { useViewIndex } from '@engine/段/时间.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { RevelationCageWire } from '@库/特效/炼狱结界.tsx';
import { revelationCageOpacity } from '@库/特效/炼狱结界线.ts';
import { GirlYaBoLun, hover } from '../../角色/娘化亚波伦.tsx';
import { RevelationCageGlow } from '../../特效/炼狱结界辉线.tsx';
import { RevelationCagePerformance } from '../../特效/炼狱结界演出.tsx';
import { cagePerformanceStateAt } from '../../特效/炼狱结界演出状态.ts';
import { sideBySideCenters, yaBoLunPos, performanceSettings, aspect, views, type View } from './视图.ts';

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

// 暗红底：背景、雾取封面草稿段的雾色和雾距，地面取暗的下界岩色
const baseColors = { 灰: { background: '#5a5e66', ground: '#8a8f98' }, 暗红: { background: '#3a0a07', ground: '#3b1513' } } as const;

const Ground: React.FC<{ 色?: string }> = ({ 色: color = baseColors.灰.ground }) => (
  <mesh position={[0, 0, -0.05]}>
    <boxGeometry args={[160, 160, 0.1]} />
    <meshStandardMaterial color={color} />
  </mesh>
);

const Content: React.FC<{ v: View }> = ({ v }) => {
  if (v.pictureMode.type === '原版') {
    return (
      <>
        {v.pictureMode.ground && <Ground />}
        <Steve pose={stevePose([0, 0, 0], 180)} mcLight={1} />
        <group position={[0, 0, 0.9]}>
          <RevelationCageWire sec={v.pictureMode.spinSec} opacity={v.pictureMode.ageTicks === undefined ? 1 : revelationCageOpacity(v.pictureMode.ageTicks)} />
        </group>
      </>
    );
  }
  const groundColor = baseColors[v.bottomBackground ?? '灰'].ground;
  if (v.pictureMode.type === '并排') {
    const spinSec = v.pictureMode.spinSec;
    return (
      <>
        <Ground 色={groundColor} />
        {sideBySideCenters.map((c, i) => (
          <React.Fragment key={i}>
            <Steve pose={stevePose([c[0], c[1], 0], 180)} mcLight={1} />
            <group position={c}>{i === 0 ? <RevelationCageWire sec={spinSec} /> : <RevelationCageGlow sec={spinSec} />}</group>
          </React.Fragment>
        ))}
      </>
    );
  }
  const s = cagePerformanceStateAt(v.pictureMode.sec, performanceSettings);
  return (
    <>
      <Ground 色={groundColor} />
      {/* 史蒂夫面朝西看着亚波伦（yaw 正 = 往左转，0 朝 +Y） */}
      <Steve pose={stevePose([0, 0, 0], 90)} mcLight={1} hurt={s.fireIntensity > 0.6 ? 1 : 0} />
      <GirlYaBoLun pose={{ loc: yaBoLunPos, yaw: -90 }} sec={v.pictureMode.sec % 3} act={hover} />
      <RevelationCagePerformance sec={v.pictureMode.sec} settings={performanceSettings} />
    </>
  );
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const s = v.pictureMode.type === '演出' ? cagePerformanceStateAt(v.pictureMode.sec, performanceSettings) : undefined;
  const background = baseColors[v.bottomBackground ?? '灰'].background;
  return (
    <AbsoluteFill style={{ background: background }}>
      <ThreeCanvas width={aspect.width} height={aspect.height} gl={{ antialias: false }}>
        <color attach="background" args={[background]} />
        {v.bottomBackground === '暗红' && <fog attach="fog" args={[background, 16, 70]} />}
        <CameraRig v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <Content v={v} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.name}</div>
        {v.note && <div style={{ fontSize: 16 }}>{v.note}</div>}
        {s && (
          <div style={{ fontSize: 16 }}>
            演出第 {v.pictureMode.type === '演出' ? v.pictureMode.sec.toFixed(2) : ''} 秒　阶段 {s.stage}　半径系数 {s.radiusFactor.toFixed(2)}（顶点离中心 {s.circumRadius.toFixed(2)} 格）　透明度 {s.opacity.toFixed(2)}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
