// 晋升之环核对的画面：灰底或暗红底（带雾）、一块地面；环单独并排，或戴在娘化亚波伦、史蒂夫头后。视图表在 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
// 画布开抗锯齿：环是顺滑的真几何，不开的话圆的边是锯齿。史蒂夫没做 UV 内收（见 @库/角色/史蒂夫.tsx），开了以后他的轮廓可能冒出贴图相邻格子的颜色，这里只看环，不管。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import { useViewIndex } from '@engine/段/时间.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { RingedSteve } from '../../角色/戴环史蒂夫.tsx';
import { GirlYaBoLun, hover, stand } from '../../角色/娘化亚波伦.tsx';
import { AscensionHalo } from '../../特效/晋升之环.tsx';
import { twoPeoplePos, singleView, sideBySide, aspect, views, type View } from './视图.ts';

// 暗红底：背景、雾取封面草稿段的雾色，地面取暗的下界岩色
const baseColors = { 灰: { background: '#5a5e66', ground: '#8a8f98' }, 暗红: { background: '#3a0a07', ground: '#3b1513' } } as const;

const CameraRig: React.FC<{ v: View }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  const lift = v.pictureMode.类 === '戴' ? (v.pictureMode.lift ?? 0) : 0;
  cam.fov = v.fov;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(sceneToThree([v.眼[0], v.眼[1], v.眼[2] + lift]));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree([v.看[0], v.看[1], v.看[2] + lift]));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const Content: React.FC<{ v: View }> = ({ v }) => {
  if (v.pictureMode.类 === '并排') {
    return (
      <>
        {sideBySide.variants.map((variant, i) => (
          // 环坐标（+Y 上、+Z 朝观众）→ 场景（Z 上、观众在南）：绕 X 转 +90 度
          <group key={variant} position={[sideBySide.x[i]!, 0, sideBySide.高]} rotation={[Math.PI / 2, 0, 0]} scale={sideBySide.cellsPerPixel}>
            <AscensionHalo variant={variant} 秒={v.ringSec} />
          </group>
        ))}
      </>
    );
  }
  if (v.pictureMode.类 === '单看') {
    return (
      <group position={[0, 0, singleView.高]} rotation={[Math.PI / 2, 0, 0]} scale={singleView.cellsPerPixel}>
        <AscensionHalo variant={v.pictureMode.variant} 秒={v.ringSec} />
      </group>
    );
  }
  const { 谁: actor, variant, act, lift = 0 } = v.pictureMode;
  const twoPeople = actor === '两人';
  return (
    <>
      {actor !== '史蒂夫' && (
        <GirlYaBoLun pose={{ loc: [twoPeople ? twoPeoplePos.yaBoLun : 0, 0, twoPeople ? 0.6 : lift], yaw: 180 }} 秒={0.5} act={act === '悬停' ? hover : stand} holdWand={twoPeople} headRing={variant} ringSec={v.ringSec} />
      )}
      {actor !== '亚波伦' && <RingedSteve pose={stevePose([twoPeople ? twoPeoplePos.steve : 0, 0, 0], 180)} mcLight={1} ring={variant} ringSec={v.ringSec} />}
    </>
  );
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const colorSet = baseColors[v.bottomBackground];
  return (
    <AbsoluteFill style={{ background: colorSet.background }}>
      <div style={{ width: aspect.宽, height: aspect.高 }}>
        <ThreeCanvas width={aspect.宽} height={aspect.高} gl={{ antialias: true }}>
          <color attach="background" args={[colorSet.background]} />
          {v.bottomBackground === '暗红' && <fog attach="fog" args={[colorSet.background, 30, 140]} />}
          <CameraRig v={v} />
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <ambientLight intensity={0.55 * Math.PI} />
            <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
            <mesh position={[0, 0, -0.05]}>
              <boxGeometry args={[160, 160, 0.1]} />
              <meshStandardMaterial color={colorSet.ground} />
            </mesh>
            <Content v={v} />
          </group>
        </ThreeCanvas>
      </div>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        {v.说明 && <div style={{ fontSize: 16 }}>{v.说明}</div>}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
