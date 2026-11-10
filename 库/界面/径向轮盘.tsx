// 径向轮盘的屏幕组件：一张铺满容器的画布，圆心在正中，和游戏里 Screen 的中心一样。画什么由 `画` 决定（原版一圈用 画原版轮盘，见 径向轮盘画.ts）。
// s 是 GUI 缩放（一个 GUI 像素几个画面像素）。图标 16×16 最近邻放大，s × 出片倍数是整数时每个贴图像素一样大：1280×720 出 4K（3 倍）取 8/3，一个 GUI 像素 8 个输出像素。
// 画布同步画（useLayoutEffect），Remotion 逐帧截图不会截早。
import React, { useLayoutEffect, useRef } from 'react';
import { 画原版轮盘, type 原版轮盘参数, type 画布位 } from './径向轮盘画.ts';

export const 轮盘画布: React.FC<{ 宽: number; 高: number; s: number; 画: (位: 画布位) => void; style?: React.CSSProperties }> = ({ 宽, 高, s, 画, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(宽 * dpr));
  const h = Math.max(1, Math.round(高 * dpr));
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    画({ ctx, 心x: Math.floor(w / 2), 心y: Math.floor(h / 2), 倍: s * dpr });
  });
  return <canvas ref={ref} width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, display: 'block', ...style }} />;
};

/** 原版一圈的径向轮盘（Goety 的 GenericRadialMenu），参数见 原版轮盘参数 */
export const 径向轮盘: React.FC<原版轮盘参数 & { 宽: number; 高: number; s: number }> = ({ 宽, 高, s, ...参 }) => <轮盘画布 宽={宽} 高={高} s={s} 画={(位) => 画原版轮盘(位, 参)} />;
