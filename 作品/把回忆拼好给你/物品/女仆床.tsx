// 女仆床（车万女仆 1.5.3，取材「卧室床」：models/bedrock/block/maid_bed/pink.json，默认粉色）。第 12 句卧室里她那张床：到了睡觉的点，女仆本该自己去睡它（三稿）。
// 方块实体只在床头那格画整张床（两格长）。TileEntityMaidBedRenderer.render（1.20.1 反汇编）：绕格中心按 facing.get2DDataValue() × 90° 转，
//   translate(0.5, 1.5, −0.5)、scale(−1, −1, 1) 后画基岩模型；换到场景里就是：朝南时整张模型照 BedrockModelView 原样摆，原点在床头那格中心往北一格，
//   床头板落在床头那格的南边、床身往北伸一格。朝别的方向绕床头那格的中心转。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）：位 = 床头那一格的底面中心，朝 = 床头朝哪边（方块状态的 facing），床尾在床头的反方向一格。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { type BedrockModel, BedrockModelView } from '@engine/model/基岩模型.tsx';
import { png } from '@engine/model/贴图.ts';
import raw from 'asset:模型/物品/女仆床';
import tex from 'asset:贴图/物品/女仆床';
import type { 床朝向 } from './床尺寸.ts';

export { 女仆床面高 } from './床尺寸.ts';

export const 女仆床模型 = { ...(raw as unknown as object), texture: png(tex) } as unknown as BedrockModel;

/** 场景里绕 Z 转多少（弧度）：朝南 0，朝东 +90°（南转到东），朝北 180° */
const 转角: Record<床朝向, number> = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };

/** 一张女仆床。受光材质，放进三渲二画布由平涂接管 */
export const 女仆床: React.FC<{ 位: V3; 朝?: 床朝向 }> = ({ 位, 朝 = 'north' }) => (
  <group position={位} rotation={[0, 0, 转角[朝]]}>
    <group position={[0, 1, 0]}>
      <BedrockModelView model={女仆床模型} />
    </group>
  </group>
);
