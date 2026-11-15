// 魔杖细做核对的画面：原版下界魔杖和细做的三个候选。灰底看形和料，暗红底（下界的雾色，光照 核对/封面草稿 的配法）看在成片背景上认不认得出。视图表在 视图.ts。
// 场景内容放在 rotation [−π/2, 0, 0] 的 group 里（场景 Z 朝上 → three Y 朝上）；杖空间 Y 朝上，立在场景里再绕 X 转 +90 度。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import type { Cam } from '@engine/core/机位.ts';
import { placeCamera } from '@engine/core/three换算.ts';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import { useViewIndex } from '@engine/段/时间.tsx';
import { GirlYaBoLun, stand } from '../../角色/娘化亚波伦.tsx';
import { NetherWand } from '../../物品/下界魔杖.tsx';
import { refinedStaffVariant, refinedVariants, RefinedWand } from '../../物品/下界魔杖细做.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { midShot, sideBySideRig, sideBySideGap, holdingRigs, shaftRig, wandHeadRig, variants, aspect, views, type Variant, type View } from './视图.ts';

const baseColors = { 灰: '#5a5e66', 暗红: '#2c0806' } as const;
/** 拿在她手上的大小：角色缩放 0.7 */
const handScale = 0.7;
const PlaceRig: React.FC<{ cameraRig: Cam }> = ({ cameraRig }) => {
  const { camera, size, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  placeCamera(camera as THREE.PerspectiveCamera, cameraRig, size.width / size.height);
  return null;
};

const Lamp: React.FC<{ bottomBackground: View['bottomBackground'] }> = ({ bottomBackground }) =>
  bottomBackground === '灰' ? (
    <>
      <ambientLight intensity={0.55 * Math.PI} />
      <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
    </>
  ) : (
    <>
      <ambientLight color="#ffffff" intensity={0.3 * Math.PI} />
      <directionalLight position={[-2.5, -6, 4]} color="#fff2ea" intensity={0.55 * Math.PI} />
      <directionalLight position={[2, 7, -4]} color="#ff8a5c" intensity={0.35 * Math.PI} />
    </>
  );

/** 立着的一根：杖尾在原点、杖头朝场景 +Z，绕杖轴转 转 度 */
const StandingWand: React.FC<{ variant: Variant; 转?: number }> = ({ variant, 转: rotationDeg = 0 }) => (
  <group rotation={[Math.PI / 2, (rotationDeg * Math.PI) / 180, 0]} scale={handScale}>
    {variant === '原版' ? (
      // 原版的物品空间：原点 = 模型 (8, 8, 8)，杖轴在 x = −0.5/16、z = 0.5/16，杖尾 y = −0.5
      <group position={[0.5 / 16, 0.5, -0.5 / 16]}>
        <NetherWand />
      </group>
    ) : (
      <RefinedWand variant={variant} />
    )}
  </group>
);

const pixelSize = handScale / 16;
const coreHeight = (variant: Variant) => (variant === '原版' ? 27.5 : refinedVariants[variant].coreHeight) * pixelSize;
/** 杆近看对着哪一处（杖像素）：握把 = 握点，上段 = 握把顶到杖头底之间 */
const shaftMid = (variant: Variant, rodSeg: '握把' | '上段') => (variant === '原版' ? 15 : rodSeg === '握把' ? refinedVariants[variant].grip - 2 : refinedVariants[variant].grip + 9.5) * pixelSize;

// 中景的姿势（封面草稿四稿戊）：两腿一前一后微屈，左臂摊开，右臂伸直、手腕转 90 度让杖顺着手臂指出去，头转回镜头
const pointDownRight: Record<string, BonePose> = {
  RightLeg: { rot: [-12, 0, 0] },
  RightLowerLeg: { rot: [28, 0, 0] },
  LeftLeg: { rot: [6, 0, 0] },
  LeftLowerLeg: { rot: [10, 0, 0] },
  LeftArm: { rot: [0, 0, -50] },
  LeftForeArm: { rot: [-20, 0, 0] },
  RightArm: { rot: [-28, 0, -72] },
  RightHand: { rot: [90, 0, 0] },
  Head: { rot: [0, 25, 0] },
};

const YaBoLun: React.FC<{ variant: Variant; 位: readonly number[]; yaw: number; bonePose?: Record<string, BonePose> }> = ({ variant, 位: pos, yaw, bonePose }) => {
  const staff = useMemo(() => (variant === '原版' ? undefined : refinedStaffVariant(variant)), [variant]);
  return <GirlYaBoLun pose={{ loc: [...pos], yaw }} 秒={0.5} act={stand} holdWand 杖={staff} bonePose={bonePose} />;
};

const Scene: React.FC<{ v: View }> = ({ v }) => {
  const { bottomBackground, pictureMode } = v;
  const cameraRig =
    pictureMode.类 === '并排' ? sideBySideRig : pictureMode.类 === '杖头' ? wandHeadRig(coreHeight(pictureMode.variant)) : pictureMode.类 === '杆' ? shaftRig(shaftMid(pictureMode.variant, pictureMode.段)) : pictureMode.类 === '持杖' ? holdingRigs[pictureMode.cameraRig] : midShot.cameraRig;
  return (
    <>
      <color attach="background" args={[baseColors[bottomBackground]]} />
      <PlaceRig cameraRig={cameraRig} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <Lamp bottomBackground={bottomBackground} />
        {pictureMode.类 === '并排' &&
          variants.map((k, i) => (
            <group key={k} position={[(i - 1.5) * sideBySideGap, 0, 0]}>
              <StandingWand variant={k} 转={25} />
            </group>
          ))}
        {pictureMode.类 === '杖头' && <StandingWand variant={pictureMode.variant} 转={pictureMode.variant === '丙' ? 20 : 0} />}
        {pictureMode.类 === '杆' && (
          <group rotation={[0, Math.PI / 2, 0]}>
            <StandingWand variant={pictureMode.variant} 转={25} />
          </group>
        )}
        {pictureMode.类 === '持杖' && (
          <>
            <mesh position={[0, 0, -0.05]}>
              <boxGeometry args={[12, 12, 0.1]} />
              <meshStandardMaterial color="#8a8f98" />
            </mesh>
            <YaBoLun variant={pictureMode.variant} 位={[0, 0, 0]} yaw={180} />
          </>
        )}
        {pictureMode.类 === '中景' && <YaBoLun variant={pictureMode.variant} 位={midShot.位} yaw={midShot.yaw} bonePose={pointDownRight} />}
      </group>
    </>
  );
};

// 中景里她在左上：字挪到左下，不压着她
const Caption: React.FC<{ v: View }> = ({ v }) => (
  <div style={{ position: 'absolute', left: 16, right: 16, ...(v.pictureMode.类 === '中景' ? { bottom: 12 } : { top: 12 }), color: '#ffffff', fontFamily: 'sans-serif', fontSize: 20, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
    <div>{v.名}</div>
    {v.说明 && <div style={{ fontSize: 13 }}>{v.说明}</div>}
  </div>
);

export default definePicture(seg, soundUrl, () => {
  const v = views[Math.min(views.length - 1, useViewIndex())]!;
  return (
    <AbsoluteFill style={{ background: baseColors[v.bottomBackground] }}>
      <ThreeCanvas width={aspect.宽} height={aspect.高} gl={{ antialias: true }}>
        <Scene v={v} />
      </ThreeCanvas>
      <Caption v={v} />
    </AbsoluteFill>
  );
});
