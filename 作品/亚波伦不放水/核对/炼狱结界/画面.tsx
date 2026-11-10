// 炼狱结界核对的画面：灰底（或暗红底带雾，视图的 底）、一块地面，史蒂夫站在原点，演出视图里亚波伦悬在西边空中。视图表在 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
// 画布不开抗锯齿：史蒂夫没做 UV 内收（见 @库/角色/史蒂夫.tsx），游戏里的线也没有抗锯齿。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import { use视图下标 } from '@engine/段/时间.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { 炼狱结界线框 } from '@库/特效/炼狱结界.tsx';
import { 炼狱结界透明度 } from '@库/特效/炼狱结界线.ts';
import { 娘化亚波伦, 悬停 } from '../../角色/娘化亚波伦.tsx';
import { 炼狱结界辉线 } from '../../特效/炼狱结界辉线.tsx';
import { 炼狱结界演出 } from '../../特效/炼狱结界演出.tsx';
import { 结界演出状态在 } from '../../特效/炼狱结界演出状态.ts';
import { 并排中心, 亚波伦位置, 演出设定, 画幅, 视图们, type 视图 } from './视图.ts';

const 机位: React.FC<{ v: 视图 }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.视角;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(场景到three(v.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

// 暗红底：背景、雾取封面草稿段的雾色和雾距，地面取暗的下界岩色
const 底色 = { 灰: { 背景: '#5a5e66', 地: '#8a8f98' }, 暗红: { 背景: '#3a0a07', 地: '#3b1513' } } as const;

const 地面: React.FC<{ 色?: string }> = ({ 色 = 底色.灰.地 }) => (
  <mesh position={[0, 0, -0.05]}>
    <boxGeometry args={[160, 160, 0.1]} />
    <meshStandardMaterial color={色} />
  </mesh>
);

const 内容: React.FC<{ v: 视图 }> = ({ v }) => {
  if (v.画.类 === '原版') {
    return (
      <>
        {v.画.地面 && <地面 />}
        <Steve pose={stevePose([0, 0, 0], 180)} mcLight={1} />
        <group position={[0, 0, 0.9]}>
          <炼狱结界线框 秒={v.画.转动秒} 透明度={v.画.活了几刻 === undefined ? 1 : 炼狱结界透明度(v.画.活了几刻)} />
        </group>
      </>
    );
  }
  const 地色 = 底色[v.底 ?? '灰'].地;
  if (v.画.类 === '并排') {
    const 转动秒 = v.画.转动秒;
    return (
      <>
        <地面 色={地色} />
        {并排中心.map((c, i) => (
          <React.Fragment key={i}>
            <Steve pose={stevePose([c[0], c[1], 0], 180)} mcLight={1} />
            <group position={c}>{i === 0 ? <炼狱结界线框 秒={转动秒} /> : <炼狱结界辉线 秒={转动秒} />}</group>
          </React.Fragment>
        ))}
      </>
    );
  }
  const s = 结界演出状态在(v.画.秒, 演出设定);
  return (
    <>
      <地面 色={地色} />
      {/* 史蒂夫面朝西看着亚波伦（yaw 正 = 往左转，0 朝 +Y） */}
      <Steve pose={stevePose([0, 0, 0], 90)} mcLight={1} hurt={s.火势 > 0.6 ? 1 : 0} />
      <娘化亚波伦 pose={{ loc: 亚波伦位置, yaw: -90 }} 秒={v.画.秒 % 3} 表演={悬停} />
      <炼狱结界演出 秒={v.画.秒} 设定={演出设定} />
    </>
  );
};

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  const s = v.画.类 === '演出' ? 结界演出状态在(v.画.秒, 演出设定) : undefined;
  const 背景 = 底色[v.底 ?? '灰'].背景;
  return (
    <AbsoluteFill style={{ background: 背景 }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: false }}>
        <color attach="background" args={[背景]} />
        {v.底 === '暗红' && <fog attach="fog" args={[背景, 16, 70]} />}
        <机位 v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <内容 v={v} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        {v.说明 && <div style={{ fontSize: 16 }}>{v.说明}</div>}
        {s && (
          <div style={{ fontSize: 16 }}>
            演出第 {v.画.类 === '演出' ? v.画.秒.toFixed(2) : ''} 秒　阶段 {s.阶段}　半径系数 {s.半径系数.toFixed(2)}（顶点离中心 {s.外接球半径.toFixed(2)} 格）　透明度 {s.透明度.toFixed(2)}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
