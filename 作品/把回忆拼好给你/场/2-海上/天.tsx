// 第 4 句日落的天：三维画布后面的一张 2D 画布（三维画布透明）。按海上的透视机位逐块算视线，取 天色.ts 的分档颜色，所以色带跟着镜头转、是硬边；
// 太阳用原版贴图的本体（正中 8×8）照 编排.ts 的方向和大小画，外面两圈硬边光圈，不画原版那圈平滑光晕（五家评审 10-24：平滑光晕是 CG 味）。
// 坑：本体加光圈这一段是 地点/天空.tsx 画天体、光圈 的副本（那边没导出，归全片画风一路改）。改全片的太阳画法时这里要一起改，
// 等 天空.tsx 把画一个太阳的函数导出来，这里改成引用。
// 原版画太阳是叠加混合，这里用 lighter。月亮这时在东边地平线下（镜头背后），不画；云不画（Agent 暂定：晴天，天上只有太阳）。
// 画布按成片分辨率建（页面尺寸 × 成片倍数），预览级由浏览器缩小。
import React, { useLayoutEffect, useRef } from 'react';
import { png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import sunPng from 'asset:贴图/环境/太阳';
import { 仰角方位差, 太阳屏幕, 视线, type 透视 } from './编排.ts';
import { 天色在 } from './天色.ts';

/** 天色一块多少成片像素：色带的边按这么大的台阶走 */
const 块 = 8;
/** 太阳贴图：一格 32×32，本体是正中 8×8（第 12～19 个贴图像素） */
const 本体起 = 12;
const 本体边 = 8;
/** 本体外的硬边光圈：每圈一个贴图像素宽，颜色 = 原版光晕紧挨本体那一格 × 亮（同 地点/天空.tsx 的 光圈） */
const 光圈: readonly { 宽: number; 亮: number }[] = [
  { 宽: 1, 亮: 1 },
  { 宽: 1, 亮: 0.5 },
];

export type 日落天属性 = {
  机: 透视;
  /** 游戏刻（太阳的位置） */
  刻: number;
  宽: number;
  高: number;
};

export const 日落天: React.FC<日落天属性> = ({ 机, 刻, 宽, 高 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数;
  const H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const bw = Math.ceil(W / 块);
    const bh = Math.ceil(H / 块);
    const img = new ImageData(bw, bh);
    for (let j = 0; j < bh; j++)
      for (let i = 0; i < bw; i++) {
        const { 仰, 差 } = 仰角方位差(视线(机, ((i + 0.5) * 块) / 成片倍数, ((j + 0.5) * 块) / 成片倍数, 宽, 高));
        const c = 天色在(仰, 差);
        const o = (j * bw + i) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    const 小 = document.createElement('canvas');
    小.width = bw;
    小.height = bh;
    小.getContext('2d')!.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(小, 0, 0, bw * 块, bh * 块);

    const 日 = 太阳屏幕(机, 刻, 宽, 高);
    if (!日) return;
    const tex = png(sunPng);
    const n = Math.max(1, Math.round((日.边 * 成片倍数) / 本体边)); // 一个贴图像素几个成片像素
    const x0 = Math.round(日.x * 成片倍数 - (本体边 * n) / 2);
    const y0 = Math.round(日.y * 成片倍数 - (本体边 * n) / 2);
    ctx.globalCompositeOperation = 'lighter';
    for (let v = 0; v < 本体边; v++)
      for (let u = 0; u < 本体边; u++) {
        const o = ((本体起 + v) * tex.w + 本体起 + u) * 4;
        const a = tex.px[o + 3]!;
        if (!a) continue;
        ctx.fillStyle = `rgba(${tex.px[o]},${tex.px[o + 1]},${tex.px[o + 2]},${a / 255})`;
        ctx.fillRect(x0 + u * n, y0 + v * n, n, n);
      }
    const 晕 = ((本体起 - 1) * tex.w + 16) * 4;
    const 色 = [tex.px[晕]!, tex.px[晕 + 1]!, tex.px[晕 + 2]!];
    const 边 = 本体边 * n;
    let 内 = 0;
    for (const { 宽: w, 亮 } of 光圈) {
      const t = w * n;
      ctx.fillStyle = `rgb(${色.map((c) => Math.round(c * 亮)).join(',')})`;
      // 上下左右四条，互不重叠（lighter 是叠加，重叠的地方会更亮）
      ctx.fillRect(x0 - 内 - t, y0 - 内 - t, 边 + 2 * (内 + t), t);
      ctx.fillRect(x0 - 内 - t, y0 + 边 + 内, 边 + 2 * (内 + t), t);
      ctx.fillRect(x0 - 内 - t, y0 - 内, t, 边 + 2 * 内);
      ctx.fillRect(x0 + 边 + 内, y0 - 内, t, 边 + 2 * 内);
      内 += t;
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};
