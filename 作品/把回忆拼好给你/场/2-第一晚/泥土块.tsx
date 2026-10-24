// 泥土方块物品：手里拿的、地上掉的都是一个六面贴泥土的小立方体（原版方块物品照方块模型画）。物品坐标：中心在原点，边长 1（再由显示变换缩小）。
// 受光材质，平涂按朝向乘面明暗、乘色调。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import 泥土图 from 'asset:贴图/方块/泥土';

export const 泥土贴图 = () => png(泥土图);

export const 泥土块: React.FC = () => (
  <mesh>
    <boxGeometry args={[1, 1, 1]} />
    <meshLambertMaterial map={entityTexture(泥土贴图())} />
  </mesh>
);

/** 掉在地上的一块：中心 = 物品实体脚底往上 0.25 + 浮（ItemEntityRenderer 的 sin(刻/10 + 偏)·0.1 + 0.1，再加 ground 显示变换的 3/16 和缩放后的半格），
 *  绕竖轴转 转 弧度，边长 0.25 格（block/block.json 的 ground） */
export const 地上泥土: React.FC<{ 位: readonly [number, number, number]; 转: number; 大小: number }> = ({ 位, 转, 大小 }) => (
  <group position={[位[0], 位[1], 位[2]]} rotation={[0, 0, 转]} scale={大小}>
    <泥土块 />
  </group>
);
