// 晋升之环核对的画面：灰底或暗红底（带雾）、一块地面；环单独并排，或戴在娘化亚波伦、史蒂夫头后。视图表在 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
// 画布开抗锯齿：环是顺滑的真几何，不开的话圆的边是锯齿。史蒂夫没做 UV 内收（见 @库/角色/史蒂夫.tsx），开了以后他的轮廓可能冒出贴图相邻格子的颜色，这里只看环，不管。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import { use视图下标 } from '@engine/段/时间.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { 戴环史蒂夫 } from '../../角色/戴环史蒂夫.tsx';
import { 娘化亚波伦, 悬停, 站立 } from '../../角色/娘化亚波伦.tsx';
import { 晋升之环 } from '../../特效/晋升之环.tsx';
import { 两人位, 单看, 并排, 画幅, 视图们, type 视图 } from './视图.ts';

// 暗红底：背景、雾取封面草稿段的雾色，地面取暗的下界岩色
const 底色 = { 灰: { 背景: '#5a5e66', 地: '#8a8f98' }, 暗红: { 背景: '#3a0a07', 地: '#3b1513' } } as const;

const 机位: React.FC<{ v: 视图 }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  const 抬 = v.画.类 === '戴' ? (v.画.离地 ?? 0) : 0;
  cam.fov = v.视角;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(场景到three([v.眼[0], v.眼[1], v.眼[2] + 抬]));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three([v.看[0], v.看[1], v.看[2] + 抬]));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const 内容: React.FC<{ v: 视图 }> = ({ v }) => {
  if (v.画.类 === '并排') {
    return (
      <>
        {并排.款们.map((款, i) => (
          // 环坐标（+Y 上、+Z 朝观众）→ 场景（Z 上、观众在南）：绕 X 转 +90 度
          <group key={款} position={[并排.x[i]!, 0, 并排.高]} rotation={[Math.PI / 2, 0, 0]} scale={并排.每像素格}>
            <晋升之环 款={款} 秒={v.环秒} />
          </group>
        ))}
      </>
    );
  }
  if (v.画.类 === '单看') {
    return (
      <group position={[0, 0, 单看.高]} rotation={[Math.PI / 2, 0, 0]} scale={单看.每像素格}>
        <晋升之环 款={v.画.款} 秒={v.环秒} />
      </group>
    );
  }
  const { 谁, 款, 表演, 离地 = 0 } = v.画;
  const 两人 = 谁 === '两人';
  return (
    <>
      {谁 !== '史蒂夫' && (
        <娘化亚波伦 pose={{ loc: [两人 ? 两人位.亚波伦 : 0, 0, 两人 ? 0.6 : 离地], yaw: 180 }} 秒={0.5} 表演={表演 === '悬停' ? 悬停 : 站立} 持杖={两人} 头后环={款} 环秒={v.环秒} />
      )}
      {谁 !== '亚波伦' && <戴环史蒂夫 pose={stevePose([两人 ? 两人位.史蒂夫 : 0, 0, 0], 180)} mcLight={1} 环={款} 环秒={v.环秒} />}
    </>
  );
};

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  const 色 = 底色[v.底];
  return (
    <AbsoluteFill style={{ background: 色.背景 }}>
      <div style={{ width: 画幅.宽, height: 画幅.高 }}>
        <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }}>
          <color attach="background" args={[色.背景]} />
          {v.底 === '暗红' && <fog attach="fog" args={[色.背景, 30, 140]} />}
          <机位 v={v} />
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <ambientLight intensity={0.55 * Math.PI} />
            <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
            <mesh position={[0, 0, -0.05]}>
              <boxGeometry args={[160, 160, 0.1]} />
              <meshStandardMaterial color={色.地} />
            </mesh>
            <内容 v={v} />
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

export default 画面;
