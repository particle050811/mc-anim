// 原版床（取材「卧室床」：BedRenderer 的床头、床尾两层 m_173550_、m_173551_，贴图 entity/bed/red.png，史蒂夫默认睡的红床）。第 12 句卧室里你那张床。
// 床是方块实体，床头、床尾两格各画自己那一块（BedRenderer.render 在世界里只画本格的 part，foot 参数是 false）。renderPiece（1.20.1 反汇编）：
//   translate(0, 9/16, 0) · rotX(90°) · 绕格中心 rotZ(180° + facing.toYRot()) · 模型像素 ÷ 16；床身 6 像素厚，压成离地 3/16～9/16 的床垫，四条腿垫到地。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）：位 = 床头那一格的底面中心（格 (i, j, k) 是 (i, j + 0.5, k)），朝 = 床头朝哪边（方块状态的 facing），
//   床尾在床头的反方向一格。游戏坐标换场景：x → x，y → z，z（朝南）→ −y。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { type EntityModelData, type EntityPart, ownPartGeometry } from '@engine/model/实体模型.tsx';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import { png } from '@engine/model/贴图.ts';
import raw from 'asset:模型/物品/床';
import redBedPng from 'asset:贴图/物品/床/红';
import { type BedFacing, facingStep } from './床尺寸.ts';

export { type BedFacing, bedSurfaceHeight } from './床尺寸.ts';

const models = (raw as unknown as { models: { 床头: EntityModelData; 床尾: EntityModelData } }).models;
const red = png(redBedPng);

/** Direction.toYRot（度） */
const facingAngle: Record<BedFacing, number> = { south: 0, west: 90, north: 180, east: 270 };

const radPerDeg = Math.PI / 180;

/** 一格床（游戏坐标、格内 0～1）→ 场景：格底面中心 位 */
const cellMatrix = (pos: V3, facing: BedFacing) => {
  const axisSwap = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const m = new THREE.Matrix4().makeTranslation(pos[0] - 0.5, pos[1] + 0.5, pos[2]).multiply(axisSwap);
  m.multiply(new THREE.Matrix4().makeTranslation(0, 9 / 16, 0));
  m.multiply(new THREE.Matrix4().makeRotationX(90 * radPerDeg));
  m.multiply(new THREE.Matrix4().makeTranslation(0.5, 0.5, 0.5));
  m.multiply(new THREE.Matrix4().makeRotationZ((180 + facingAngle[facing]) * radPerDeg));
  m.multiply(new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5));
  return m.multiply(new THREE.Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16));
};

const PartNode: React.FC<{ p: EntityPart; texSize: number[]; mat: THREE.Material }> = ({ p, texSize, mat }) => (
  <group position={p.pose.offset as [number, number, number]} rotation={[p.pose.rot[0]!, p.pose.rot[1]!, p.pose.rot[2]!, 'ZYX']}>
    {p.cubes.length > 0 && <mesh geometry={ownPartGeometry(p, texSize)} material={mat} />}
    {p.children.map((c) => (
      <PartNode key={c.name} p={c} texSize={texSize} mat={mat} />
    ))}
  </group>
);

const BedCell: React.FC<{ 层: EntityModelData; 位: V3; facing: BedFacing; mat: THREE.Material }> = ({ 层: modelLayer, 位: pos, facing, mat }) => {
  const m = useMemo(() => cellMatrix(pos, facing), [pos[0], pos[1], pos[2], facing]);
  return (
    <group matrix={m} matrixAutoUpdate={false}>
      <PartNode p={modelLayer.root} texSize={modelLayer.texSize} mat={mat} />
    </group>
  );
};

/** 一张原版床（两格）。受光材质，放进三渲二画布由平涂接管 */
export const Bed: React.FC<{ 位: V3; facing?: BedFacing }> = ({ 位: pos, facing = 'north' }) => {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: entityTexture(red), alphaTest: 0.1 }), []);
  const [dx, dy] = facingStep[facing];
  const footPos: V3 = [pos[0] - dx, pos[1] - dy, pos[2]];
  return (
    <group>
      <BedCell 层={models.床头} 位={pos} facing={facing} mat={mat} />
      <BedCell 层={models.床尾} 位={footPos} facing={facing} mat={mat} />
    </group>
  );
};
