// 杖尖轮盘：多圈聚晶轮盘立在世界里、以下界魔杖的杖尖为圆心张开（用户 11-10 定），圆心的炼狱聚晶就在杖尖。本片轮盘在世界里的标准摆法。
// 放在场景坐标（Z 朝上）的 group 里；杖 用 角色/娘化亚波伦.tsx 的 持杖位姿 算，摆法（盘面朝哪）见 杖尖盘位姿.ts。
// 张开（参.刻）是多圈轮盘自己的动画：最里一圈从圆心（杖尖）放大，外圈一圈圈往外弹。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { WheelWorldPlane } from '@库/界面/径向轮盘世界.tsx';
import { staffTipPlatePose, type PlatePose, type DiscPlacement } from './杖尖盘位姿.ts';
import { drawMultiRingWheel, wheelOuterRadius, type MultiRingParams } from './多圈轮盘.tsx';

/** 把盘位姿变成 group 的矩阵：轮盘世界面在本地 XY、朝 +Z、画布的上是 +Y */
export const discMatrix = (disc: PlatePose) => new THREE.Matrix4().makeBasis(new THREE.Vector3(...disc.right), new THREE.Vector3(...disc.上), new THREE.Vector3(...disc.normal)).setPosition(...disc.心);

export const WandTipWheel: React.FC<
  DiscPlacement & {
    /** 杖尖的位置和杖身的方向（场景坐标） */
    杖: { tip: V3; axis: V3 };
    params: MultiRingParams;
    /** 一个 GUI 像素在世界里多少格 */
    cellsPerPixel: number;
    renderOrder?: number;
  }
> = ({ 杖: staff, params: ringParams, cellsPerPixel, renderOrder, ...placement }) => {
  const cacheKey = JSON.stringify([staff, placement]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const matrix = useMemo(() => discMatrix(staffTipPlatePose(staff, placement)), [cacheKey]);
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <WheelWorldPlane draw={(canvasPos) => drawMultiRingWheel(canvasPos, ringParams)} radius={Math.max(128, wheelOuterRadius(ringParams) + 4)} cellsPerPixel={cellsPerPixel} deps={[JSON.stringify(ringParams)]} renderOrder={renderOrder} />
    </group>
  );
};
