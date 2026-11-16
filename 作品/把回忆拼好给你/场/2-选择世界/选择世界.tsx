// 「选择世界」画面：成片分辨率的 2D 画布（同 库/界面/像素聊天栏.tsx：预览级由浏览器缩一半），画 画界面.ts 的界面；片尾的碎片另一张透明画布，段叠在上面。
// 钻进图标时图标里透掉的照片像素是透明的，段把新世界垫在这张画布下面，就从图标框里露出来。
import React, { useLayoutEffect, useRef } from 'react';
import { filmScale } from '@engine/三渲二/像素.ts';
import { iconEdge } from '../../界面/实例图标.ts';
import { shardParams } from './参数.ts';
import { iconFrame, normalFraming, shards, shardAt } from './编排.ts';
import { project, drawSelectWorld, type UiState, type Framing } from './画界面.ts';

const shardEdge = shardParams.shardEdge;

export type SelectWorldProps = {
  state: UiState;
  /** 页面尺寸，默认 1280×720 */
  width?: number;
  height?: number;
};

/** 铺满画面，放在 position 不是 static 的容器里 */
export const SelectWorld: React.FC<SelectWorldProps> = ({ state: uiState, width: width = 1280, height: height = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = width * filmScale, H = height * filmScale;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawSelectWorld(ctx, W, H, uiState);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />;
};

export type ShardLayerProps = {
  /** 段内帧，0 = 片尾白光 */
  f: number;
  /** 拼回来的新图标（图标边×图标边 RGBA） */
  新: Uint8Array;
  framing?: Framing;
  width?: number;
  height?: number;
};

/** 片尾的碎片：每块画新图标的那一块，飞着的按 碎块在 的位置、大小，到位的画进图标框那一格；还没起飞的不画。透明底，叠在界面上面 */
export const ShardLayer: React.FC<ShardLayerProps> = ({ f, 新: newPixels, framing: t = normalFraming, width: width = 1280, height: height = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = width * filmScale, H = height * filmScale;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const P = project(t, W, H);
    shards.forEach((b) => {
      const s = shardAt(b, f);
      if (!s) return;
      const cell = s.dest ? { x: iconFrame.x + (b.i * iconFrame.side * shardEdge) / iconEdge, y: iconFrame.y + (b.j * iconFrame.side * shardEdge) / iconEdge, side: (iconFrame.side * shardEdge) / iconEdge } : { x: s.x, y: s.y, side: s.side };
      const subCellStep = cell.side / shardEdge;
      for (let y = 0; y < shardEdge; y++)
        for (let x = 0; x < shardEdge; x++) {
          const o = ((b.j * shardEdge + y) * iconEdge + b.i * shardEdge + x) * 4;
          const x0 = P.x(cell.x + x * subCellStep), y0 = P.y(cell.y + y * subCellStep);
          ctx.fillStyle = `rgb(${newPixels[o]},${newPixels[o + 1]},${newPixels[o + 2]})`;
          ctx.fillRect(x0, y0, P.x(cell.x + (x + 1) * subCellStep) - x0, P.y(cell.y + (y + 1) * subCellStep) - y0);
        }
    });
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />;
};
