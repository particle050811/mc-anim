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
import 红贴图 from 'asset:贴图/物品/床/红';
import { type 床朝向, 朝向步 } from './床尺寸.ts';

export { type 床朝向, 床面高 } from './床尺寸.ts';

const 模型 = (raw as unknown as { models: { 床头: EntityModelData; 床尾: EntityModelData } }).models;
const 红 = png(红贴图);

/** Direction.toYRot（度） */
const 朝向角: Record<床朝向, number> = { south: 0, west: 90, north: 180, east: 270 };

const 度 = Math.PI / 180;

/** 一格床（游戏坐标、格内 0～1）→ 场景：格底面中心 位 */
const 格矩阵 = (位: V3, 朝: 床朝向) => {
  const 换系 = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const m = new THREE.Matrix4().makeTranslation(位[0] - 0.5, 位[1] + 0.5, 位[2]).multiply(换系);
  m.multiply(new THREE.Matrix4().makeTranslation(0, 9 / 16, 0));
  m.multiply(new THREE.Matrix4().makeRotationX(90 * 度));
  m.multiply(new THREE.Matrix4().makeTranslation(0.5, 0.5, 0.5));
  m.multiply(new THREE.Matrix4().makeRotationZ((180 + 朝向角[朝]) * 度));
  m.multiply(new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5));
  return m.multiply(new THREE.Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16));
};

const 部件: React.FC<{ p: EntityPart; texSize: number[]; mat: THREE.Material }> = ({ p, texSize, mat }) => (
  <group position={p.pose.offset as [number, number, number]} rotation={[p.pose.rot[0]!, p.pose.rot[1]!, p.pose.rot[2]!, 'ZYX']}>
    {p.cubes.length > 0 && <mesh geometry={ownPartGeometry(p, texSize)} material={mat} />}
    {p.children.map((c) => (
      <部件 key={c.name} p={c} texSize={texSize} mat={mat} />
    ))}
  </group>
);

const 一格: React.FC<{ 层: EntityModelData; 位: V3; 朝: 床朝向; mat: THREE.Material }> = ({ 层, 位, 朝, mat }) => {
  const m = useMemo(() => 格矩阵(位, 朝), [位[0], 位[1], 位[2], 朝]);
  return (
    <group matrix={m} matrixAutoUpdate={false}>
      <部件 p={层.root} texSize={层.texSize} mat={mat} />
    </group>
  );
};

/** 一张原版床（两格）。受光材质，放进三渲二画布由平涂接管 */
export const 床: React.FC<{ 位: V3; 朝?: 床朝向 }> = ({ 位, 朝 = 'north' }) => {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: entityTexture(红), alphaTest: 0.1 }), []);
  const [dx, dy] = 朝向步[朝];
  const 尾: V3 = [位[0] - dx, 位[1] - dy, 位[2]];
  return (
    <group>
      <一格 层={模型.床头} 位={位} 朝={朝} mat={mat} />
      <一格 层={模型.床尾} 位={尾} 朝={朝} mat={mat} />
    </group>
  );
};
