// 侧剖面的天：画在三维画布后面的一张 2D 画布（三维画布透明），颜色从地平线往上渐变，一个贴图像素一行；太阳、月亮用原版贴图的本体按 天体.ts 的位置画，
// 贴图像素对齐到方块的像素格上，原版贴图里本体外面那圈平滑光晕不画，换成几圈硬边色阶（见 光圈）。
// 原版画太阳、月亮是叠加混合（blendFuncSeparate(SRC_ALPHA, ONE, …)），这里用 lighter，贴图黑底叠上去就没了。
// 画在 2D 里：三渲二的斜投影不影响它，房子、树照样挡在前面（三维画布不给 天，背景透明）；每帧重画同一张画布，不新建贴图。
// 渐变、贴图像素格从剖面（y = 0）上的地面线、门洞西边数起。
// 画布按成片分辨率建（页面尺寸 × 成片倍数），预览级由浏览器缩小（同 库/界面/像素聊天栏.tsx）。
import React, { useLayoutEffect, useRef } from 'react';
import { type Png, png } from '@engine/model/贴图.ts';
import sunPng from 'asset:贴图/环境/太阳';
import moonPng from 'asset:贴图/环境/月相';
import { filmScale } from '@engine/三渲二/像素.ts';
import type { SideFraming } from './侧剖面.tsx';
import { skyBrightness, celestialPosition, type SkyArc } from './天体.ts';
import { lerpV } from '@engine/core/数学.ts';

/** 天色：地平 = 地面线那里的颜色，顶 = 往上 渐变高 格以上的颜色（sRGB）；夜里两个都换成 夜 的颜色（按 天亮 混） */
export type SkyColors = { horizon: string; topColor: string; gradientHeight: number; nightHorizon: string; nightTop: string };

const parseColor = (s: string) => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
// 按 sRGB 数值插（像素画的渐变）
/** 太阳、月亮贴图一格 32×32 像素，画出来一个贴图像素 = 方块的一个贴图像素。本体是正中 8×8（第 12～19 个贴图像素，半格见方），外面是光晕 */
const celestialTile = 32;
const sunBodyStart = 12;
const sunBodyLength = 8;

/** 原版光晕（本体外一圈一圈淡下去，从 40/255 淡到 1/255）不画，换成本体外面这几圈硬边色阶：每圈 宽 个贴图像素，对齐贴图像素格，
 *  颜色 = 原版光晕紧挨本体那一格的颜色 × 亮（叠加上去，太阳偏暖黄、月亮偏蓝）。
 *  五家评审 10-24 都说平滑光晕是 CG 味（主会话定：只留原版方块太阳月亮，最多一两圈硬边色阶）；两圈各一个贴图像素是五家评审 10-24 后 Agent 暂定 */
const halo: readonly { 宽: number; bright: number }[] = [
  { 宽: 1, bright: 1 },
  { 宽: 1, bright: 0.5 },
];

/** 画一个太阳或月亮：(u0, v0) 是贴图里那一格的左上角，(x0, y0) 是这一格 32×32 画在画布上的左上角，n = 一个贴图像素几个画布像素（坐标都按原版尺寸）。
 *  列 = 贴图横着几格（太阳 1、月相 4）：材质包的高清贴图是原版的 k 倍（k = 宽 ÷ (列 × 32)），一个高清像素画 n / k，光圈也按高清像素宽 */
const drawCelestial = (ctx: CanvasRenderingContext2D, tex: Png, cols: number, u0: number, v0: number, x0: number, y0: number, n: number, alpha = 1, withHalo = true) => {
  const k = tex.w / (cols * celestialTile);
  const m = n / k;
  for (let v = sunBodyStart * k; v < (sunBodyStart + sunBodyLength) * k; v++)
    for (let u = sunBodyStart * k; u < (sunBodyStart + sunBodyLength) * k; u++) {
      const o = ((v0 * k + v) * tex.w + u0 * k + u) * 4;
      const a = tex.px[o + 3]!;
      if (!a || !(tex.px[o]! | tex.px[o + 1]! | tex.px[o + 2]!)) continue;
      ctx.fillStyle = `rgba(${tex.px[o]},${tex.px[o + 1]},${tex.px[o + 2]},${(a / 255) * alpha})`;
      ctx.fillRect(x0 + u * m, y0 + v * m, m, m);
    }
  if (!withHalo) return;
  const haloIndex = (((v0 + sunBodyStart) * k - 1) * tex.w + (u0 + celestialTile / 2) * k) * 4; // 本体正上方紧挨着的那格光晕
  const color = [tex.px[haloIndex]!, tex.px[haloIndex + 1]!, tex.px[haloIndex + 2]!];
  const bx = x0 + sunBodyStart * n, by = y0 + sunBodyStart * n, side = sunBodyLength * n;
  let inset = 0; // 这一圈内沿离本体几个画布像素
  for (const { 宽: width, bright } of halo) {
    const t = width * m;
    ctx.fillStyle = `rgba(${color.map((c) => Math.round(c * bright)).join(',')},${alpha})`;
    // 上下左右四条，互不重叠（lighter 是叠加，重叠的地方会更亮）
    ctx.fillRect(bx - inset - t, by - inset - t, side + 2 * (inset + t), t);
    ctx.fillRect(bx - inset - t, by + side + inset, side + 2 * (inset + t), t);
    ctx.fillRect(bx - inset - t, by - inset, t, side + 2 * inset);
    ctx.fillRect(bx + side + inset, by - inset, t, side + 2 * inset);
    inset += t;
  }
};

export type SideSkyProps = {
  framing: SideFraming;
  /** 画布的页面尺寸（和三维画布一样） */
  宽: number;
  高: number;
  色: SkyColors;
  /** 游戏刻（天体.ts） */
  刻?: number;
  /** 太阳月亮走的弧，不给就不画太阳月亮 */
  arc?: SkyArc;
  /** 天随昼夜变暗的程度（1 照原版，0 一直白天的颜色），第 13 句快转时压低 */
  lightDarkAmp?: number;
  /** 快转时太阳、月亮身后的残影：再画 张 个早 刻差、2·刻差…刻的位置（只画本体、不带光圈），最近的不透明度 首透，往后按张数线性变淡；不给不画 */
  afterimage?: { ghostCount: number; tickGap: number; firstAlpha: number };
  style?: React.CSSProperties;
};

/** 放在三维画布后面（同一个定位容器里、先画），自己铺满 宽 × 高 */
export const SideSectionSky: React.FC<SideSkyProps> = ({ framing, 宽: width, 高: height, 色: color, 刻: tick = 6000, arc, lightDarkAmp = 1, afterimage, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = width * filmScale, H = height * filmScale;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const { 中心: center, pxPerCell } = framing;
    const n = pxPerCell / 16; // 一个贴图像素几个画布像素
    // 地面线、门洞西边（x = −0.5）在画布上的位置：贴图像素的格从这里数
    const groundY = H / 2 + center[1] * pxPerCell;
    const cellX0 = W / 2 + (-0.5 - center[0]) * pxPerCell;
    const bright = 1 - lightDarkAmp * (1 - skyBrightness(tick));
    const horizonColor = lerpV(parseColor(color.nightHorizon), parseColor(color.horizon), bright);
    const topColor = lerpV(parseColor(color.nightTop), parseColor(color.topColor), bright);
    ctx.globalCompositeOperation = 'source-over';
    for (let r = -Math.ceil((H - groundY) / n); r * n < groundY; r++) {
      const z = (r + 0.5) / 16;
      const c = lerpV(horizonColor, topColor, Math.sqrt(Math.min(1, Math.max(0, z / color.gradientHeight))));
      ctx.fillStyle = `rgb(${c.map(Math.round).join(',')})`;
      ctx.fillRect(0, groundY - (r + 1) * n, W, n);
    }
    if (!arc) return;
    const snap = (v: number, origin: number) => origin + Math.round((v - origin) / n) * n;
    ctx.globalCompositeOperation = 'lighter';
    const drawSky = (tex: Png, cols: number, u0: number, v0: number, x: number, z: number, alpha?: number, withHalo?: boolean) => {
      const px = snap(W / 2 + (x - center[0]) * pxPerCell - (celestialTile * n) / 2, cellX0);
      const py = snap(H / 2 - (z - center[1]) * pxPerCell - (celestialTile * n) / 2, groundY);
      drawCelestial(ctx, tex, cols, u0, v0, px, py, n, alpha, withHalo);
    };
    const drawTwoBodies = (t: number, alpha?: number, withHalo?: boolean) => {
      const celestialPos = celestialPosition(t, arc);
      drawSky(png(sunPng), 1, 0, 0, celestialPos.sun.x, celestialPos.sun.z, alpha, withHalo);
      drawSky(png(moonPng), 4, (celestialPos.moon.phase % 4) * celestialTile, Math.floor(celestialPos.moon.phase / 4) * celestialTile, celestialPos.moon.x, celestialPos.moon.z, alpha, withHalo);
    };
    // 残影从最远（最淡）的画起；不带光圈（主会话 10-24 定分屏的轨迹不发光）
    if (afterimage) for (let i = afterimage.ghostCount; i >= 1; i--) drawTwoBodies(tick - i * afterimage.tickGap, (afterimage.firstAlpha * (afterimage.ghostCount - i + 1)) / afterimage.ghostCount, false);
    drawTwoBodies(tick);
    ctx.globalCompositeOperation = 'source-over';
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, ...style }} />;
};
