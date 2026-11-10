// 魔杖细做核对的画面：原版下界魔杖和细做的三个候选。灰底看形和料，暗红底（下界的雾色，光照 核对/封面草稿 的配法）看在成片背景上认不认得出。视图表在 视图.ts。
// 场景内容放在 rotation [−π/2, 0, 0] 的 group 里（场景 Z 朝上 → three Y 朝上）；杖空间 Y 朝上，立在场景里再绕 X 转 +90 度。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import type { Cam } from '@engine/core/机位.ts';
import { 摆相机 } from '@engine/core/three换算.ts';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { 定义画面 } from '@engine/段/段画面.tsx';
import { use视图下标 } from '@engine/段/时间.tsx';
import { 娘化亚波伦, 站立 } from '../../角色/娘化亚波伦.tsx';
import { 下界魔杖 } from '../../物品/下界魔杖.tsx';
import { 细做杖款, 细做款们, 细做魔杖 } from '../../物品/下界魔杖细做.tsx';
import 段 from './段.ts';
import 声音 from './声音地址.生成.ts';
import { 中景, 并排机位, 并排间隔, 持杖机位, 杆机位, 杖头机位, 款们, 画幅, 视图们, type 款, type 视图 } from './视图.ts';

const 底色 = { 灰: '#5a5e66', 暗红: '#2c0806' } as const;
/** 拿在她手上的大小：角色缩放 0.7 */
const 手上倍 = 0.7;
const 摆机位: React.FC<{ 机位: Cam }> = ({ 机位 }) => {
  const { camera, size, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  摆相机(camera as THREE.PerspectiveCamera, 机位, size.width / size.height);
  return null;
};

const 灯: React.FC<{ 底: 视图['底'] }> = ({ 底 }) =>
  底 === '灰' ? (
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
const 立杖: React.FC<{ 款: 款; 转?: number }> = ({ 款, 转 = 0 }) => (
  <group rotation={[Math.PI / 2, (转 * Math.PI) / 180, 0]} scale={手上倍}>
    {款 === '原版' ? (
      // 原版的物品空间：原点 = 模型 (8, 8, 8)，杖轴在 x = −0.5/16、z = 0.5/16，杖尾 y = −0.5
      <group position={[0.5 / 16, 0.5, -0.5 / 16]}>
        <下界魔杖 />
      </group>
    ) : (
      <细做魔杖 款={款} />
    )}
  </group>
);

const 像素 = 手上倍 / 16;
const 芯高 = (款: 款) => (款 === '原版' ? 27.5 : 细做款们[款].芯) * 像素;
/** 杆近看对着哪一处（杖像素）：握把 = 握点，上段 = 握把顶到杖头底之间 */
const 杆中 = (款: 款, 段: '握把' | '上段') => (款 === '原版' ? 15 : 段 === '握把' ? 细做款们[款].握 - 2 : 细做款们[款].握 + 9.5) * 像素;

// 中景的姿势（封面草稿四稿戊）：两腿一前一后微屈，左臂摊开，右臂伸直、手腕转 90 度让杖顺着手臂指出去，头转回镜头
const 指右下: Record<string, BonePose> = {
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

const 她: React.FC<{ 款: 款; 位: readonly number[]; yaw: number; 姿势?: Record<string, BonePose> }> = ({ 款, 位, yaw, 姿势 }) => {
  const 杖 = useMemo(() => (款 === '原版' ? undefined : 细做杖款(款)), [款]);
  return <娘化亚波伦 pose={{ loc: [...位], yaw }} 秒={0.5} 表演={站立} 持杖 杖={杖} 姿势={姿势} />;
};

const 场景: React.FC<{ v: 视图 }> = ({ v }) => {
  const { 底, 画 } = v;
  const 机位 =
    画.类 === '并排' ? 并排机位 : 画.类 === '杖头' ? 杖头机位(芯高(画.款)) : 画.类 === '杆' ? 杆机位(杆中(画.款, 画.段)) : 画.类 === '持杖' ? 持杖机位[画.机位] : 中景.机位;
  return (
    <>
      <color attach="background" args={[底色[底]]} />
      <摆机位 机位={机位} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <灯 底={底} />
        {画.类 === '并排' &&
          款们.map((k, i) => (
            <group key={k} position={[(i - 1.5) * 并排间隔, 0, 0]}>
              <立杖 款={k} 转={25} />
            </group>
          ))}
        {画.类 === '杖头' && <立杖 款={画.款} 转={画.款 === '丙' ? 20 : 0} />}
        {画.类 === '杆' && (
          <group rotation={[0, Math.PI / 2, 0]}>
            <立杖 款={画.款} 转={25} />
          </group>
        )}
        {画.类 === '持杖' && (
          <>
            <mesh position={[0, 0, -0.05]}>
              <boxGeometry args={[12, 12, 0.1]} />
              <meshStandardMaterial color="#8a8f98" />
            </mesh>
            <她 款={画.款} 位={[0, 0, 0]} yaw={180} />
          </>
        )}
        {画.类 === '中景' && <她 款={画.款} 位={中景.位} yaw={中景.yaw} 姿势={指右下} />}
      </group>
    </>
  );
};

// 中景里她在左上：字挪到左下，不压着她
const 字: React.FC<{ v: 视图 }> = ({ v }) => (
  <div style={{ position: 'absolute', left: 16, right: 16, ...(v.画.类 === '中景' ? { bottom: 12 } : { top: 12 }), color: '#ffffff', fontFamily: 'sans-serif', fontSize: 20, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
    <div>{v.名}</div>
    {v.说明 && <div style={{ fontSize: 13 }}>{v.说明}</div>}
  </div>
);

export default 定义画面(段, 声音, () => {
  const v = 视图们[Math.min(视图们.length - 1, use视图下标())]!;
  return (
    <AbsoluteFill style={{ background: 底色[v.底] }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }}>
        <场景 v={v} />
      </ThreeCanvas>
      <字 v={v} />
    </AbsoluteFill>
  );
});
