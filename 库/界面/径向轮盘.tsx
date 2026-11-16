// 径向轮盘的屏幕组件：一张铺满容器的画布，圆心在正中，和游戏里 Screen 的中心一样。画什么由 `画` 决定（原版一圈用 画原版轮盘，见 径向轮盘画.ts）。
// s 是 GUI 缩放（一个 GUI 像素几个画面像素）。图标 16×16 最近邻放大，s × 出片倍数是整数时每个贴图像素一样大：1280×720 出 4K（3 倍）取 8/3，一个 GUI 像素 8 个输出像素。
// 画布同步画（useLayoutEffect），Remotion 逐帧截图不会截早。
import React, { useLayoutEffect, useRef } from 'react';
import { drawVanillaWheel, type VanillaWheelParams, type CanvasPos } from './径向轮盘画.ts';

export const WheelCanvas: React.FC<{ width: number; height: number; s: number; draw: (canvasPos: CanvasPos) => void; style?: React.CSSProperties }> = ({ width: width, height: height, s, draw, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    draw({ ctx, centerX: Math.floor(w / 2), centerY: Math.floor(h / 2), scale: s * dpr });
  });
  return <canvas ref={ref} width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, display: 'block', ...style }} />;
};

/** 原版一圈的径向轮盘（Goety 的 GenericRadialMenu），参数见 原版轮盘参数 */
export const RadialWheel: React.FC<VanillaWheelParams & { width: number; height: number; s: number }> = ({ width: width, height: height, s, ...ringParams }) => <WheelCanvas width={width} height={height} s={s} draw={(canvasPos) => drawVanillaWheel(canvasPos, ringParams)} />;
