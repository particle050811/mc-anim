// 核对-体素教堂的画面：天蓝底、一盏环境光加一盏平行光，教堂的方块照结构模板的坐标摆。表里查不到的方块（箱子、告示牌、旗帜这类方块实体）不画，左上角写出种数。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
// 待迁移（私有资产）：整合包保留所有权益，结构转出的方块列表只能私有；公开版怎么办同 粉色教堂 的网格，等用户定
import pinkChapelVoxels from 'asset:数据/场景/粉色教堂/体素方块';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import { BlockAssembly, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { useViewIndex } from '@engine/段/时间.tsx';
import { voxelFromState } from '@engine/voxel/真实方块表.ts';
import { aspect, views, type View } from './视图.ts';

const voxelStructure = pinkChapelVoxels as unknown as { 尺寸: number[]; 调色板: string[]; 方块: number[] };
const drawable = voxelStructure.调色板.map((s) => voxelFromState(s) > 0);
const blocks: PlacedBlock[] = [];
for (let o = 0; o < voxelStructure.方块.length; o += 4) {
  const [x, y, z, p] = [voxelStructure.方块[o]!, voxelStructure.方块[o + 1]!, voxelStructure.方块[o + 2]!, voxelStructure.方块[o + 3]!];
  if (drawable[p]) blocks.push({ state: voxelStructure.调色板[p]!, 位: [x, -z - 1, y] });
}
const notDrawn = voxelStructure.调色板.filter((_, i) => !drawable[i]);

const CameraRig: React.FC<{ v: View }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.fov;
  cam.near = 0.5;
  cam.far = 1024;
  cam.position.copy(sceneToThree(v.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  return (
    <AbsoluteFill style={{ background: '#9cc4ee' }}>
      <ThreeCanvas width={aspect.width} height={aspect.height} gl={{ antialias: true }}>
        <color attach="background" args={['#9cc4ee']} />
        <CameraRig v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.6 * Math.PI} />
          <directionalLight position={[60, -120, 160]} intensity={0.55 * Math.PI} />
          <BlockAssembly blocks={blocks} biome="minecraft:plains" />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.name}</div>
        <div style={{ fontSize: 16 }}>{`${blocks.length} 格；方块表里查不到、没画的状态 ${notDrawn.length} 种`}</div>
      </div>
    </AbsoluteFill>
  );
};

export default picture;
