// 「选择世界」画面：成片分辨率的 2D 画布（同 库/界面/像素聊天栏.tsx：预览级由浏览器缩一半），画 画界面.ts 的界面；片尾的碎片另一张透明画布，段叠在上面。
// 钻进图标时图标里透掉的照片像素是透明的，段把新世界垫在这张画布下面，就从图标框里露出来。
import type { Png } from '@engine/model/贴图.ts';
import React, { useLayoutEffect, useRef } from 'react';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 取图标, 图标边 } from '../../界面/实例图标.ts';
import { 碎片 } from './参数.ts';
import { 图标框, 平常取景, 碎块们, 碎块在, 阈 } from './编排.ts';
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

// 每块碎片的料（块×块 的 RGBA），按源图缓存：源图里那块正方形按面积平均缩成 块×块
const 料缓存 = new WeakMap<Png, Uint8Array[]>();
const 料们 = (源: Png): Uint8Array[] => {
  let r = 料缓存.get(源);
  if (r) return r;
  const T = Math.max(1, Math.min(源.w, 源.h, 源.h * 碎片.料边));
  r = 碎块们.map((b) => 取图标(源, { x: b.料.x * (源.w - T), y: b.料.y * (源.h - T), 边: T }, 块));
  料缓存.set(源, r);
  return r;
};

export type 碎片层属性 = {
  /** 段内帧，0 = 片尾白光 */
  f: number;
  /** 拼回来的新图标（图标边×图标边 RGBA） */
  新: Uint8Array;
  /** 第 11 句碎掉的那片世界（图标源.ts 的 碎片源图） */
  源: Png;
  取景?: 取景;
  宽?: number;
  高?: number;
};

/** 片尾的碎片：已经到位的一块画成新图标那一格，还在飞的按 换 的比例一个像素一个像素地（Bayer）从世界的碎片换成新图标那一块；还没起飞的不画。透明底，叠在界面上面 */
export const 碎片层: React.FC<碎片层属性> = ({ f, 新, 源, 取景: t = 平常取景, 宽 = 1280, 高 = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数, H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const P = 投(t, W, H);
    const 料 = 料们(源);
    碎块们.forEach((b, n) => {
      const s = 碎块在(b, f);
      if (!s) return;
      const 格 = s.到 ? { x: 图标框.x + (b.i * 图标框.边 * 块) / 图标边, y: 图标框.y + (b.j * 图标框.边 * 块) / 图标边, 边: (图标框.边 * 块) / 图标边 } : { x: s.x, y: s.y, 边: s.边 };
      const 步 = 格.边 / 块;
      for (let y = 0; y < 块; y++)
        for (let x = 0; x < 块; x++) {
          const 用新 = s.到 || 阈(x, y) < s.换;
          const px = 用新 ? 新 : 料[n]!;
          const o = 用新 ? ((b.j * 块 + y) * 图标边 + b.i * 块 + x) * 4 : (y * 块 + x) * 4;
          const x0 = P.x(格.x + x * 步), y0 = P.y(格.y + y * 步);
          ctx.fillStyle = `rgb(${px[o]},${px[o + 1]},${px[o + 2]})`;
          ctx.fillRect(x0, y0, P.x(格.x + (x + 1) * 步) - x0, P.y(格.y + (y + 1) * 步) - y0);
        }
    });
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};
