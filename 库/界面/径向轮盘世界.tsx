// 径向轮盘画在世界里：同一套画布画法（径向轮盘画.ts）画到一张贴图上，贴在一个正方形的面上。游戏里轮盘只在屏幕上，立在世界里是本项目加的用法。
// 面在本地 XY 平面、朝 +Z（three 坐标），圆心在本地原点；位置和朝向由外面套的 group 定。两面都看得见，不写深度（半透明的带子后面的东西照样画）。
// 放大用最近邻（走近了图标像素不糊），缩小用多级贴图加各向异性（斜着看、离远了不闪）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CanvasPos } from './径向轮盘画.ts';

export const WheelWorldPlane: React.FC<{
  draw: (canvasPos: CanvasPos) => void;
  /** 面从圆心到边盖多少 GUI 像素（要不小于轮盘最外沿，原版带背景贴图是 128） */
  radius: number;
  /** 一个 GUI 像素在世界里多少格 */
  cellsPerPixel: number;
  /** 贴图上一个 GUI 像素几个贴图像素，默认 8 */
  textureScale?: number;
  /** 这些值变了才重画贴图（画 里用到的会变的参数都列上） */
  deps: readonly unknown[];
  renderOrder?: number;
}> = ({ draw, radius, cellsPerPixel, textureScale = 8, deps, renderOrder }) => {
  const texture = useMemo(() => {
    const side = Math.round(radius * 2 * textureScale);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    draw({ ctx: canvas.getContext('2d')!, centerX: side / 2, centerY: side / 2, scale: textureScale });
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius, textureScale, ...deps]);
  useEffect(() => () => texture.dispose(), [texture]);
  const planeSize = radius * 2 * cellsPerPixel;
  return (
    <mesh renderOrder={renderOrder}>
      <planeGeometry args={[planeSize, planeSize]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
};
