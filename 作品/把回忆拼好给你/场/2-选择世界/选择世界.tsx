// 「选择世界」画面：成片分辨率的 2D 画布（同 库/界面/像素聊天栏.tsx：预览级由浏览器缩一半），画 画界面.ts 的界面；片尾的碎片另一张透明画布，段叠在上面。
// 钻进图标时图标里透掉的照片像素是透明的，段把新世界垫在这张画布下面，就从图标框里露出来。
import React, { useLayoutEffect, useRef } from 'react';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 图标边 } from '../../界面/实例图标.ts';
import { 碎片 } from './参数.ts';
import { 图标框, 平常取景, 碎块们, 碎块在 } from './编排.ts';
import { 投, 画选择世界, type 界面状态, type 取景 } from './画界面.ts';

const 块 = 碎片.碎块边;

export type 选择世界属性 = {
  状态: 界面状态;
  /** 页面尺寸，默认 1280×720 */
  宽?: number;
  高?: number;
};

/** 铺满画面，放在 position 不是 static 的容器里 */
export const 选择世界: React.FC<选择世界属性> = ({ 状态, 宽 = 1280, 高 = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数, H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) 画选择世界(ctx, W, H, 状态);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};

export type 碎片层属性 = {
  /** 段内帧，0 = 片尾白光 */
  f: number;
  /** 拼回来的新图标（图标边×图标边 RGBA） */
  新: Uint8Array;
  取景?: 取景;
  宽?: number;
  高?: number;
};

/** 片尾的碎片：每块画新图标的那一块，飞着的按 碎块在 的位置、大小，到位的画进图标框那一格；还没起飞的不画。透明底，叠在界面上面 */
export const 碎片层: React.FC<碎片层属性> = ({ f, 新, 取景: t = 平常取景, 宽 = 1280, 高 = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数, H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const P = 投(t, W, H);
    碎块们.forEach((b) => {
      const s = 碎块在(b, f);
      if (!s) return;
      const 格 = s.到 ? { x: 图标框.x + (b.i * 图标框.边 * 块) / 图标边, y: 图标框.y + (b.j * 图标框.边 * 块) / 图标边, 边: (图标框.边 * 块) / 图标边 } : { x: s.x, y: s.y, 边: s.边 };
      const 步 = 格.边 / 块;
      for (let y = 0; y < 块; y++)
        for (let x = 0; x < 块; x++) {
          const o = ((b.j * 块 + y) * 图标边 + b.i * 块 + x) * 4;
          const x0 = P.x(格.x + x * 步), y0 = P.y(格.y + y * 步);
          ctx.fillStyle = `rgb(${新[o]},${新[o + 1]},${新[o + 2]})`;
          ctx.fillRect(x0, y0, P.x(格.x + (x + 1) * 步) - x0, P.y(格.y + (y + 1) * 步) - y0);
        }
    });
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};
