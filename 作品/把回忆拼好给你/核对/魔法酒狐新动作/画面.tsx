// 魔法酒狐新动作核对的画面：按视图表一帧画一个视图，左上角写视图名。地面、灯同 核对-魔法酒狐表情（看清贴图用，颜色是近似的）。
// 机位按姿势表现算：头、手在哪由 magicalWineFoxBoneAt 量出来，再按她身体的正面、右前方、右边、左边摆相机；花的正面转向相机（偏 = 相机在她哪个方位）。
// 正交的帧：相机沿机位方向平行看过去，每格 正交每格 页面像素，不开抗锯齿。
// 三渲二的帧：成片的画法（engine/三渲二 的画布、本作品的正交像素机位和调子），她套 贴图像素对齐（只吸附）和描边；
// 画布只开 320×180 页面像素，CSS 最近邻放大 4 倍铺满，看得清成片上的每个像素。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { DISPLAY } from '@engine/model/物品贴图.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { Outline } from '@engine/三渲二/描边.tsx';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import { canvasTone, orthoRig as filmOrthoRig } from '../../画风.ts';
import { magicalWineFoxTurnTo } from '@库/角色/魔法酒狐新动作.ts';
import { MagicalWineFoxEx, magicalWineFoxBoneAt, magicalWineFoxExBones, type HeldItem, type MagicalWineFoxExProps } from '@库/角色/魔法酒狐新动作组件.tsx';
import { aspect } from '../../分镜/时间.ts';
import { FirstPersonRig } from '../../地点/机位.tsx';
import { MoonBellLily } from '../../物品/月铃兰.tsx';
import { views, type View } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const originPos: V3 = [0, 0, 0];
// 封面：你站在她南边 2.6 格的门口，眼高 1.62
const coverEye: V3 = [0, -2.6, 1.62];

const Ground: React.FC = () => (
  <mesh position={[0, 0, -0.05]}>
    <boxGeometry args={[9, 9, 0.1]} />
    <meshStandardMaterial color="#b8945f" />
  </mesh>
);

const addVec = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** 机位：她面朝南（yaw 180），正前方 −Y、右手边 −X */
const rigDir = (cameraRig: View['cameraRig']): V3 => {
  const s = Math.SQRT1_2;
  if (cameraRig === '四分之三') return [-s, -s, 0];
  if (cameraRig === '侧面') return [-1, 0, 0];
  if (cameraRig === '左侧面') return [1, 0, 0];
  return [0, -1, 0];
};

// 正交：她站着连帽子约 1.8 格高，每格 300 页面像素让她占画面八成高（核对看得清；成片的像素密度另定）
const orthoPerCell = 300;
const toThree = ([x, y, z]: V3) => new THREE.Vector3(x, z, -y);
const OrthoRig: React.FC<{ 眼: V3; 看: V3 }> = ({ 眼: eye, 看: lookAt }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  const cam = camera as THREE.OrthographicCamera;
  cam.position.copy(toThree(eye));
  cam.up.set(0, 1, 0);
  cam.lookAt(toThree(lookAt));
  cam.zoom = orthoPerCell;
  cam.near = 0.1;
  cam.far = 100;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const setupView = (v: View) => {
  const liYing = v.cameraRig === '封面' ? { ...standPose(originPos), yaw: magicalWineFoxTurnTo(originPos, coverEye, 50, '左').yaw } : { ...standPose(originPos), yaw: 180 };
  const display = v.handheldDisplay ? DISPLAY.handheld.thirdperson_righthand : undefined;
  const holdFlowerProps = (facing?: HeldItem['facing']): Partial<MagicalWineFoxExProps> => (v.holdFlower ? { [v.leftHand ? '左手' : '右手']: { item: <MoonBellLily />, display, facing } } : {});
  const bottomProps: MagicalWineFoxExProps = { pose: liYing, stancePose: v.stancePose, expression: v.expression, blink: v.blink, 秒: v.秒, 看: Array.isArray(v.看) ? v.看 : undefined, ...holdFlowerProps() };
  const bones = magicalWineFoxExBones(bottomProps);
  const headPos = addVec(magicalWineFoxBoneAt(liYing, bones, 'Head'), [0, 0, 0.12]);
  let eye: V3;
  let lookAt: V3;
  let fov: number;
  if (v.cameraRig === '封面') [eye, lookAt, fov] = [coverEye, headPos, 40];
  else if (v.distance === '脸') [lookAt, fov] = [headPos, 26];
  else if (v.distance === '手') [lookAt, fov] = [magicalWineFoxBoneAt(liYing, bones, v.leftHand ? 'LeftHandLocator' : 'RightHandLocator'), 24];
  else [lookAt, fov] = [[0, 0, 0.55 * (headPos[2] + 0.3)], 30];
  if (v.cameraRig !== '封面') {
    const dist = v.ortho ? 30 : v.distance === '脸' ? 1.5 : v.distance === '手' ? 1.3 : 4.6;
    eye = addVec(lookAt, rigDir(v.cameraRig), dist);
    if (v.distance === '全身' && !v.ortho) eye[2] += 0.35;
  }
  const props: MagicalWineFoxExProps = {
    ...bottomProps,
    lookAt: v.看 === '镜头' ? eye! : undefined,
    ...holdFlowerProps(v.holdFlower === '原样' ? '原样' : { yawOffset: magicalWineFoxLookAt(liYing, eye!, '站')[1] }),
  };
  return { props, 眼: eye!, 看: lookAt, fov };
};

const toonScale = 4;
const toonFacing: Record<View['cameraRig'], '北' | '东' | '西'> = { 正面: '北', 四分之三: '北', 封面: '北', 侧面: '东', 左侧面: '西' };
const ToonGround: React.FC = () => (
  <mesh position={[0, 0, -0.5]}>
    <boxGeometry args={[6, 3, 1]} />
    <meshStandardMaterial color="#7fb238" />
  </mesh>
);

const ToonPicture: React.FC<{ v: View; props: MagicalWineFoxExProps }> = ({ v, props }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: aspect.宽 / toonScale, height: aspect.高 / toonScale, transform: `scale(${toonScale})`, transformOrigin: '0 0', imageRendering: 'pixelated' }}>
    <ToonCanvas 宽={aspect.宽 / toonScale} 高={aspect.高 / toonScale} cameraRig={filmOrthoRig({ 看: [0, 0, 0.9], facing: toonFacing[v.cameraRig] })} {...canvasTone('夏日白天')}>
      <ToonGround />
      <Outline>
        <TexturePixelAlign 锚={props.pose.loc as V3}>
          <MagicalWineFoxEx {...props} />
        </TexturePixelAlign>
      </Outline>
    </ToonCanvas>
  </div>
);

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const { props, 眼: eye, 看: lookAt, fov } = setupView(v);
  if (v.toon)
    return (
      <AbsoluteFill style={{ background: '#000000' }}>
        <ToonPicture v={v} props={props} />
        <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
          <div>{v.名}</div>
          <div style={{ fontSize: 16 }}>成片像素密度，最近邻放大 {toonScale} 倍</div>
        </div>
      </AbsoluteFill>
    );
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas key={v.ortho ? '正交' : '透视'} orthographic={!!v.ortho} width={aspect.宽} height={aspect.高} gl={{ antialias: !v.ortho }}>
        <color attach="background" args={['#5a5e66']} />
        {v.ortho ? <OrthoRig 眼={eye} 看={lookAt} /> : <FirstPersonRig 眼={eye} 看={lookAt} fov={fov} />}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <Ground />
          {v.legacyComponent ? <MagicalWineFox pose={props.pose} stancePose="站" blink={v.blink} 秒={v.秒} /> : <MagicalWineFoxEx {...props} />}
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        <div style={{ fontSize: 16 }}>
          姿势 {v.stancePose}
          {v.expression ? `，表情 ${v.expression}` : ''}
          {v.看 ? `，看 ${Array.isArray(v.看) ? `[${v.看.join(', ')}]` : '镜头'}` : ''}
          {v.holdFlower ? `，${v.leftHand ? '左手' : ''}拿花（${v.holdFlower}${v.handheldDisplay ? '，handheld 显示' : ''}）` : ''}
          {v.legacyComponent ? '，旧组件 MagicalWineFox 姿势=站' : ''}
          {v.ortho ? '，正交' : ''}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default picture;
