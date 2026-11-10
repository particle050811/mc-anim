// 径向轮盘画在世界里：同一套画布画法（径向轮盘画.ts）画到一张贴图上，贴在一个正方形的面上。游戏里轮盘只在屏幕上，立在世界里是本项目加的用法。
// 面在本地 XY 平面、朝 +Z（three 坐标），圆心在本地原点；位置和朝向由外面套的 group 定。两面都看得见，不写深度（半透明的带子后面的东西照样画）。
// 放大用最近邻（走近了图标像素不糊），缩小用多级贴图加各向异性（斜着看、离远了不闪）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { 画布位 } from './径向轮盘画.ts';

export const 轮盘世界面: React.FC<{
  画: (位: 画布位) => void;
  /** 面从圆心到边盖多少 GUI 像素（要不小于轮盘最外沿，原版带背景贴图是 128） */
  半径: number;
  /** 一个 GUI 像素在世界里多少格 */
  每像素格: number;
  /** 贴图上一个 GUI 像素几个贴图像素，默认 8 */
  贴图倍?: number;
  /** 这些值变了才重画贴图（画 里用到的会变的参数都列上） */
  依赖: readonly unknown[];
  renderOrder?: number;
}> = ({ 画, 半径, 每像素格, 贴图倍 = 8, 依赖, renderOrder }) => {
  const 贴图 = useMemo(() => {
    const 边 = Math.round(半径 * 2 * 贴图倍);
    const canvas = document.createElement('canvas');
    canvas.width = 边;
    canvas.height = 边;
    画({ ctx: canvas.getContext('2d')!, 心x: 边 / 2, 心y: 边 / 2, 倍: 贴图倍 });
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [半径, 贴图倍, ...依赖]);
  useEffect(() => () => 贴图.dispose(), [贴图]);
  const 边格 = 半径 * 2 * 每像素格;
  return (
    <mesh renderOrder={renderOrder}>
      <planeGeometry args={[边格, 边格]} />
      <meshBasicMaterial map={贴图} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
};
