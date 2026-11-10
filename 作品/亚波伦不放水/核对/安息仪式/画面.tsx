// 安息仪式核对的画面：暗红底（下界的雾色）、一块下界岩色的地，结构摆在原点。视图表在 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import { use视图下标 } from '@engine/段/时间.tsx';
import { 娘化亚波伦 } from '../../角色/娘化亚波伦.tsx';
import { 安息仪式演出, 安息仪式结构, 祭品 } from '../../特效/安息仪式.tsx';
import { 召唤状态在, 现身位置, 祭品们, 祭品位置, 过渡进度刻 } from '../../特效/安息仪式时序.ts';
import { 画幅, 视图们, type 视图 } from './视图.ts';

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

const 背景 = '#3a0a07';
const 地面: React.FC = () => (
  <mesh position={[0, 0, -0.06]}>
    <boxGeometry args={[160, 160, 0.1]} />
    <meshStandardMaterial color="#5a2422" />
  </mesh>
);

// 核对里静止的视图也让火和物品停在一个固定的时刻
const 静止秒 = 0.4;

const 内容: React.FC<{ v: 视图 }> = ({ v }) => {
  if (v.画.类 === '陈列') {
    return (
      <>
        {祭品们.map((定, i) => (
          <group key={定.名} position={[((i % 6) - 2.5) * 1.5, 0, i < 6 ? 2.4 : 0.8]} scale={2}>
            <祭品 名={定.名} 秒={0} />
          </group>
        ))}
      </>
    );
  }
  if (v.画.类 === '结构') {
    return (
      <>
        <地面 />
        <安息仪式结构 秒={静止秒} />
        {祭品们.map((定, i) => (
          <group key={定.名} position={祭品位置(i)}>
            <祭品 名={定.名} 秒={静止秒} />
          </group>
        ))}
      </>
    );
  }
  return (
    <>
      <地面 />
      <安息仪式演出 秒={v.画.秒} 方案={v.画.方案}>
        <娘化亚波伦 pose={{ loc: [...现身位置], yaw: 180 }} 秒={v.画.秒 - v.画.方案.现身} />
      </安息仪式演出>
    </>
  );
};

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  const s = v.画.类 === '演出' ? 召唤状态在(v.画.秒, v.画.方案) : undefined;
  return (
    <AbsoluteFill style={{ background: 背景 }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: false }}>
        <color attach="background" args={[背景]} />
        <机位 v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.6 * Math.PI} />
          <directionalLight position={[3, -4, 6]} intensity={0.5 * Math.PI} />
          <内容 v={v} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        {v.说明 && <div style={{ fontSize: 16 }}>{v.说明}</div>}
        {s && v.画.类 === '演出' && (
          <div style={{ fontSize: 16 }}>
            第 {v.画.秒.toFixed(2)} 秒（共 {v.画.方案.总秒} 秒）　阶段 {s.阶段}　祭品 {s.祭品在.toFixed(2)}　相当于游戏过渡第 {过渡进度刻(v.画.秒, v.画.方案).toFixed(0)} 刻　法阵半边 {s.法阵半边.toFixed(2)}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
