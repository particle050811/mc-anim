// 泥土方块物品：手里拿的、地上掉的都是一个六面贴泥土的小立方体（原版方块物品照方块模型画）。物品坐标：中心在原点，边长 1（再由显示变换缩小）。
// 受光材质，平涂按朝向乘面明暗、乘色调。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import dirtPng from 'asset:贴图/方块/泥土';

export const dirtTexture = () => png(dirtPng);

export const DirtBlock: React.FC = () => (
  <mesh>
    <boxGeometry args={[1, 1, 1]} />
    <meshLambertMaterial map={entityTexture(dirtTexture())} />
  </mesh>
);

/** 掉在地上的一块：中心 = 物品实体脚底往上 0.25 + 浮（ItemEntityRenderer 的 sin(刻/10 + 偏)·0.1 + 0.1，再加 ground 显示变换的 3/16 和缩放后的半格），
 *  绕竖轴转 转 弧度，边长 0.25 格（block/block.json 的 ground） */
export const GroundDirt: React.FC<{ 位: readonly [number, number, number]; 转: number; 大小: number }> = ({ 位: pos, 转: rotationRad, 大小: size }) => (
  <group position={[pos[0], pos[1], pos[2]]} rotation={[0, 0, rotationRad]} scale={size}>
    <DirtBlock />
  </group>
);
