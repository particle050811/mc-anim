// 核对-体素教堂的画面：天蓝底、一盏环境光加一盏平行光，教堂的方块照结构模板的坐标摆。表里查不到的方块（箱子、告示牌、旗帜这类方块实体）不画，左上角写出种数。
// 待迁移（私有资产）：整合包保留所有权益，结构转出的方块列表只能私有；公开版怎么办同 粉色教堂 的网格，等用户定
import pinkChapelVoxels from 'asset:数据/场景/粉色教堂/体素方块';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CheckCamera, CheckCanvas, CheckLabel, useCheckView, ZUp } from '@engine/段/核对画面.tsx';
import { BlockAssembly, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { voxelFromState } from '@engine/voxel/真实方块表.ts';
import { aspect, views } from './视图.ts';

const voxelStructure = pinkChapelVoxels as unknown as { 尺寸: number[]; 调色板: string[]; 方块: number[] };
const drawable = voxelStructure.调色板.map((s) => voxelFromState(s) > 0);
const blocks: PlacedBlock[] = [];
for (let o = 0; o < voxelStructure.方块.length; o += 4) {
  const [x, y, z, p] = [voxelStructure.方块[o]!, voxelStructure.方块[o + 1]!, voxelStructure.方块[o + 2]!, voxelStructure.方块[o + 3]!];
  if (drawable[p]) blocks.push({ state: voxelStructure.调色板[p]!, 位: [x, -z - 1, y] });
}
const notDrawn = voxelStructure.调色板.filter((_, i) => !drawable[i]);

const picture: React.FC = () => {
  const v = useCheckView(views);
  return (
    <AbsoluteFill style={{ background: '#9cc4ee' }}>
      <CheckCanvas width={aspect.width} height={aspect.height} background="#9cc4ee">
        <CheckCamera eye={v.眼} target={v.看} fov={v.fov} near={0.5} far={1024} />
        <ZUp>
          <ambientLight intensity={0.6 * Math.PI} />
          <directionalLight position={[60, -120, 160]} intensity={0.55 * Math.PI} />
          <BlockAssembly blocks={blocks} biome="minecraft:plains" />
        </ZUp>
      </CheckCanvas>
      <CheckLabel title={v.name}>
        <div style={{ fontSize: 16 }}>{`${blocks.length} 格；方块表里查不到、没画的状态 ${notDrawn.length} 种`}</div>
      </CheckLabel>
    </AbsoluteFill>
  );
};

export default picture;
