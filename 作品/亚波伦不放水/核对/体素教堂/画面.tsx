// 核对-体素教堂的画面：天蓝底、一盏环境光加一盏平行光，教堂的方块照结构模板的坐标摆。表里查不到的方块（箱子、告示牌、旗帜这类方块实体）不画，左上角写出种数。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
// 待迁移（私有资产）：整合包保留所有权益，结构转出的方块列表只能私有；公开版怎么办同 粉色教堂 的网格，等用户定
import 结构 from 'asset:数据/场景/粉色教堂/体素方块';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import { 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import { use视图下标 } from '@engine/段/时间.tsx';
import { voxelFromState } from '@engine/voxel/真实方块表.ts';
import { 画幅, 视图们, type 视图 } from './视图.ts';

const 数据 = 结构 as unknown as { 尺寸: number[]; 调色板: string[]; 方块: number[] };
const 画得出 = 数据.调色板.map((s) => voxelFromState(s) > 0);
const 方块们: 方块[] = [];
for (let o = 0; o < 数据.方块.length; o += 4) {
  const [x, y, z, p] = [数据.方块[o]!, 数据.方块[o + 1]!, 数据.方块[o + 2]!, 数据.方块[o + 3]!];
  if (画得出[p]) 方块们.push({ 状态: 数据.调色板[p]!, 位: [x, -z - 1, y] });
}
const 没画 = 数据.调色板.filter((_, i) => !画得出[i]);

const 机位: React.FC<{ v: 视图 }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.视角;
  cam.near = 0.5;
  cam.far = 1024;
  cam.position.copy(场景到three(v.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  return (
    <AbsoluteFill style={{ background: '#9cc4ee' }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }}>
        <color attach="background" args={['#9cc4ee']} />
        <机位 v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.6 * Math.PI} />
          <directionalLight position={[60, -120, 160]} intensity={0.55 * Math.PI} />
          <方块拼搭 方块们={方块们} 群系="minecraft:plains" />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        <div style={{ fontSize: 16 }}>{`${方块们.length} 格；方块表里查不到、没画的状态 ${没画.length} 种`}</div>
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
