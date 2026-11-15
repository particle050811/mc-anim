// 第 4 句日落的天：三维画布后面的一张 2D 画布（三维画布透明）。按海上的透视机位逐块算视线，取 天色.ts 的分档颜色，所以色带跟着镜头转、是硬边；
// 太阳用原版贴图的本体（正中 8×8）照 编排.ts 的方向和大小画，外面两圈硬边光圈，不画原版那圈平滑光晕（五家评审 10-24：平滑光晕是 CG 味）。
// 坑：本体加光圈这一段是 地点/天空.tsx 画天体、光圈 的副本（那边没导出，归全片画风一路改）。改全片的太阳画法时这里要一起改，
// 等 天空.tsx 把画一个太阳的函数导出来，这里改成引用。
// 原版画太阳是叠加混合，这里用 lighter。月亮这时在东边地平线下（镜头背后），不画；云不画（Agent 暂定：晴天，天上只有太阳）。
// 画布按成片分辨率建（页面尺寸 × 成片倍数），预览级由浏览器缩小。
import React, { useLayoutEffect, useRef } from 'react';
import { png } from '@engine/model/贴图.ts';
import { filmScale } from '@engine/三渲二/像素.ts';
import sunPng from 'asset:贴图/环境/太阳';
import { elevationAzimuthDiff, sunScreen, sightDir, type Perspective } from './编排.ts';
import { skyColorAt } from './天色.ts';

/** 天色一块多少成片像素：色带的边按这么大的台阶走 */
const tileSize = 8;
/** 太阳贴图：一格 32×32，本体是正中 8×8（第 12～19 个贴图像素） */
const sunBodyStart = 12;
const sunBodyLength = 8;
/** 本体外的硬边光圈：每圈一个贴图像素宽，颜色 = 原版光晕紧挨本体那一格 × 亮（同 地点/天空.tsx 的 光圈） */
const halo: readonly { 宽: number; bright: number }[] = [
  { 宽: 1, bright: 1 },
  { 宽: 1, bright: 0.5 },
];

export type SunsetSkyProps = {
  机: Perspective;
  /** 游戏刻（太阳的位置） */
  刻: number;
  宽: number;
  高: number;
};

export const SunsetSky: React.FC<SunsetSkyProps> = ({ 机: rig, 刻: tick, 宽: width, 高: height }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = width * filmScale;
  const H = height * filmScale;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const bw = Math.ceil(W / tileSize);
    const bh = Math.ceil(H / tileSize);
    const img = new ImageData(bw, bh);
    for (let j = 0; j < bh; j++)
      for (let i = 0; i < bw; i++) {
        const { elevation, 差: azimuthDiff } = elevationAzimuthDiff(sightDir(rig, ((i + 0.5) * tileSize) / filmScale, ((j + 0.5) * tileSize) / filmScale, width, height));
        const c = skyColorAt(elevation, azimuthDiff);
        const o = (j * bw + i) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    const small = document.createElement('canvas');
    small.width = bw;
    small.height = bh;
    small.getContext('2d')!.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, bw * tileSize, bh * tileSize);

    const sun = sunScreen(rig, tick, width, height);
    if (!sun) return;
    const tex = png(sunPng);
    // 材质包的高清太阳是原版 32×32 的 k 倍：一个高清像素取整数个成片像素（m），本体照样 本体边 × k 个
    const k = tex.w / 32;
    const m = Math.max(1, Math.round((sun.side * filmScale) / (sunBodyLength * k))); // 一个贴图像素几个成片像素
    const side = sunBodyLength * k * m;
    const x0 = Math.round(sun.x * filmScale - side / 2);
    const y0 = Math.round(sun.y * filmScale - side / 2);
    ctx.globalCompositeOperation = 'lighter';
    for (let v = 0; v < sunBodyLength * k; v++)
      for (let u = 0; u < sunBodyLength * k; u++) {
        const o = ((sunBodyStart * k + v) * tex.w + sunBodyStart * k + u) * 4;
        const a = tex.px[o + 3]!;
        if (!a) continue;
        ctx.fillStyle = `rgba(${tex.px[o]},${tex.px[o + 1]},${tex.px[o + 2]},${a / 255})`;
        ctx.fillRect(x0 + u * m, y0 + v * m, m, m);
      }
    const haloIndex = ((sunBodyStart * k - 1) * tex.w + 16 * k) * 4;
    const color = [tex.px[haloIndex]!, tex.px[haloIndex + 1]!, tex.px[haloIndex + 2]!];
    let inset = 0;
    for (const { 宽: w, bright: brightness } of halo) {
      const t = w * m;
      ctx.fillStyle = `rgb(${color.map((c) => Math.round(c * brightness)).join(',')})`;
      // 上下左右四条，互不重叠（lighter 是叠加，重叠的地方会更亮）
      ctx.fillRect(x0 - inset - t, y0 - inset - t, side + 2 * (inset + t), t);
      ctx.fillRect(x0 - inset - t, y0 + side + inset, side + 2 * (inset + t), t);
      ctx.fillRect(x0 - inset - t, y0 - inset, t, side + 2 * inset);
      ctx.fillRect(x0 + side + inset, y0 - inset, t, side + 2 * inset);
      inset += t;
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />;
};
