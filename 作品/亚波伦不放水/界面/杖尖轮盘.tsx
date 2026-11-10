// 杖尖轮盘：多圈聚晶轮盘立在世界里、以下界魔杖的杖尖为圆心张开（用户 11-10 定），圆心的炼狱聚晶就在杖尖。本片轮盘在世界里的标准摆法。
// 放在场景坐标（Z 朝上）的 group 里；杖 用 角色/娘化亚波伦.tsx 的 持杖位姿 算，摆法（盘面朝哪）见 杖尖盘位姿.ts。
// 张开（参.刻）是多圈轮盘自己的动画：最里一圈从圆心（杖尖）放大，外圈一圈圈往外弹。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { 轮盘世界面 } from '@库/界面/径向轮盘世界.tsx';
import { 杖尖盘位姿, type 盘位姿, type 盘摆法 } from './杖尖盘位姿.ts';
import { 画多圈轮盘, 轮盘外半径, type 多圈轮盘参数 } from './多圈轮盘.tsx';

/** 把盘位姿变成 group 的矩阵：轮盘世界面在本地 XY、朝 +Z、画布的上是 +Y */
export const 盘矩阵 = (盘: 盘位姿) => new THREE.Matrix4().makeBasis(new THREE.Vector3(...盘.右), new THREE.Vector3(...盘.上), new THREE.Vector3(...盘.法向)).setPosition(...盘.心);

export const 杖尖轮盘: React.FC<
  盘摆法 & {
    /** 杖尖的位置和杖身的方向（场景坐标） */
    杖: { 尖: V3; 轴: V3 };
    参: 多圈轮盘参数;
    /** 一个 GUI 像素在世界里多少格 */
    每像素格: number;
    renderOrder?: number;
  }
> = ({ 杖, 参, 每像素格, renderOrder, ...摆法 }) => {
  const 键 = JSON.stringify([杖, 摆法]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const 矩阵 = useMemo(() => 盘矩阵(杖尖盘位姿(杖, 摆法)), [键]);
  return (
    <group matrix={矩阵} matrixAutoUpdate={false}>
      <轮盘世界面 画={(位) => 画多圈轮盘(位, 参)} 半径={Math.max(128, 轮盘外半径(参) + 4)} 每像素格={每像素格} 依赖={[JSON.stringify(参)]} renderOrder={renderOrder} />
    </group>
  );
};
