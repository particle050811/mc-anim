// 第 4 句末尾「一道浪把画面卷走」：2D 浪从画面下沿涌上来盖满画面，再往上退出去露出下一镜。画法按 样式（参数.ts 的 浪样式名）：
// 像素版一格 浪格 个页面像素（减半、四分之一的格子更小，浪形、时刻不变），硬边，颜色分四层（浪色）；平滑版浪头、浪身连续，几层颜色平滑过渡，浪身上加横着的波纹和碎光。
// 进：0 还没起（看不见）→ 1 正好盖满 → 2 浪尾也退出画面上沿。第 4 句段里走 0 → 1（编排.ts 的 浪进），第 5 句接着走 1 → 2 就能从浪里出来。
// 放在 position 不是 static 的容器里，自己铺满 宽 × 高；画布按成片分辨率建。
import React, { useLayoutEffect, useRef } from 'react';
import { smoothstep } from '@engine/core/数学.ts';
import { filmScale } from '@engine/三渲二/像素.ts';
import { waveShape, waveCell, waveSparkleColor, waveColor, seaWaveColors, type WaveStyleName } from './参数.ts';

// 固定的伪随机（同一格每帧一样）：浪身里零星的亮格
const scatter = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const subdivision: Readonly<Record<string, number>> = { 像素: 1, 像素减半: 2, 像素四分之一: 4 };

/** 像素版：一格 浪格 ÷ s 个页面像素，浪形（振幅、波长、漂）和几层的厚度都按原来的格数 × s，所以浪的样子、走的快慢和 s = 1 一样，只是台阶更细 */
const drawPixelWave = (ctx: CanvasRenderingContext2D, waveIn: number, W: number, H: number, s: number) => {
  const c = (waveCell * filmScale) / s;
  const cols = Math.ceil(W / c);
  const rows = Math.ceil(H / c);
  const A = waveShape.amplitude * s;
  const travelLen = rows + 2 * A + 2 * s; // 浪头从画面下面 A+1 格走到上面 A+1 格（原来的格）
  const waveOffset = (i: number, phase: number) => A * Math.sin((2 * Math.PI * i) / (waveShape.wavelength * s) + phase);
  const drift = waveIn * waveShape.drift * s;
  for (let i = 0; i < cols; i++) {
    const topRow = Math.round((1 - Math.min(1, waveIn)) * travelLen - A - s + waveOffset(i + drift, 0));
    const endRow = waveIn <= 1 ? Infinity : Math.round((2 - waveIn) * travelLen - A - s + waveOffset(i - drift, 2.1));
    const waveTop = waveOffset(i + drift, 0) / A; // −1～1，浪尖上冒沫
    for (let j = Math.max(0, topRow - s); j < Math.min(rows, endRow); j++) {
      const d = j - topRow;
      let color: string | null;
      if (d < 0) color = waveTop < -0.6 && (i + j) % 2 === 0 ? waveColor.foam : null;
      else if (d < s) color = waveColor.foam;
      else if (d < 3 * s) color = waveColor.bright;
      else if (d < 8 * s) color = scatter(i, j) < 0.06 ? waveColor.bright : waveColor.body;
      else color = scatter(i, j) < 0.04 ? waveColor.body : waveColor.deep;
      if (Number.isFinite(endRow) && j >= endRow - s) color = waveColor.bright;
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(i * c, j * c, c, c);
    }
  }
};

const hexToRgb = (hex: string): [number, number, number] => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as [number, number, number];

/** 平滑版：浪头、浪尾的位置照像素版的式子（不取整），按原来的格算深度 d（浪头往下几格），颜色按 d 平滑过渡：
 *  沫（0～1 格，下沿随横向起伏成花边）→ 亮（到 3 格）→ 身（到 8 格往后慢慢变深）→ 深；浪身上叠横着拉长的波纹（明暗）和几道细碎光，越近浪头越亮 */
const drawSmoothWave = (ctx: CanvasRenderingContext2D, waveIn: number, W: number, H: number, isSeaSurface: boolean) => {
  const color = isSeaSurface ? seaWaveColors : { ...waveColor, 光: waveSparkleColor };
  const [foam, brightColor, body, depthWater, light] = [color.foam, color.bright, color.body, color.deep, color.光].map(hexToRgb) as [number, number, number][];
  const c = waveCell * filmScale;
  const rows = Math.ceil(H / c);
  const A = waveShape.amplitude;
  const travelLen = rows + 2 * A + 2;
  const waveOffset = (x: number, phase: number) => A * Math.sin((2 * Math.PI * x) / waveShape.wavelength + phase);
  const drift = waveIn * waveShape.drift;
  const img = ctx.createImageData(W, H);
  const p = img.data;
  const heights = new Float32Array(W);
  const tails = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / c;
    // 像素版第 i 列的浪头在 round(…起伏(i + 漂))，列中心 u = i + 0.5：这里取 u − 0.5，平滑版的浪头正好穿过像素版每一列台阶的中间
    heights[x] = (1 - Math.min(1, waveIn)) * travelLen - A - 1 + waveOffset(u - 0.5 + drift, 0);
    tails[x] = waveIn <= 1 ? Infinity : (2 - waveIn) * travelLen - A - 1 + waveOffset(u - 0.5 - drift, 2.1);
  }
  const onePixel = 1 / c; // 一个画布像素是几格（抗锯齿的宽）
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / c;
    for (let x = 0; x < W; x++) {
      const topY = heights[x]!;
      const d = v - topY;
      if (d < -1.5 * onePixel) continue;
      const edgeY = tails[x]!;
      if (v > edgeY + 1.5 * onePixel) continue;
      const u = (x + 0.5) / c;
      // 沫的下沿：一格上下随横向起伏，成花边
      const foamEdge = 1 + 0.35 * Math.sin(u * 0.9 + drift * 0.37) * Math.sin(u * 0.23 - drift * 0.21);
      const foamRatio = 1 - smoothstep(foamEdge - 0.25, foamEdge + 0.25, d);
      // 水：亮 → 身（3～6 格）→ 深（8～16 格）
      const k1 = smoothstep(2.2, 6, d);
      const k2 = smoothstep(7, 16, d);
      // 横着拉长的波纹：明暗起伏，越深越弱；碎光：几道细亮线，靠近浪头多、往下少
      const pattern = Math.sin(v * 2.1 + 1.3 * Math.sin(u * 0.31 + waveIn * 2.0) + waveIn * 6) * Math.sin(u * 0.07 - v * 0.15 + waveIn * 1.3);
      const grainStrength = 0.07 * (1 - 0.6 * k2);
      // 碎光是一截一截的短亮线（不连成整条），每条错开
      const band = smoothstep(0.45, 0.85, 0.5 + 0.5 * Math.sin(u * 0.62 + 3.1 * Math.sin(v * 0.83) + waveIn * 4));
      const blend = Math.pow(Math.max(0, Math.sin(v * 3.3 + 2.2 * Math.sin(u * 0.19 - waveIn * 3) + Math.sin(u * 0.043 + 1.1))), 14) * band * (1 - smoothstep(1.5, 10, d)) * 0.85;
      const a = smoothstep(-onePixel, onePixel, d) * (Number.isFinite(edgeY) ? 1 - smoothstep(edgeY - onePixel, edgeY + onePixel, v) : 1);
      if (a <= 0) continue;
      // 浪尾（退的时候）那一道亮边，同像素版最后一格是 亮
      const tailBright = Number.isFinite(edgeY) ? 1 - smoothstep(0.4, 1.4, edgeY - v) : 0;
      const o = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        let w = brightColor[ch]! + (body[ch]! - brightColor[ch]!) * k1;
        w = w + (depthWater[ch]! - w) * k2;
        w = w * (1 + grainStrength * pattern);
        w = w + (light[ch]! - w) * blend;
        w = w + (brightColor[ch]! - w) * tailBright;
        w = w + (foam[ch]! - w) * foamRatio;
        p[o + ch] = w;
      }
      p[o + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

export const SunsetWave: React.FC<{ waveIn: number; 宽: number; 高: number; 样式?: WaveStyleName }> = ({ waveIn, 宽: width, 高: height, 样式: waveStyle = '像素' }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = width * filmScale;
  const H = height * filmScale;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (waveIn <= 0 || waveIn >= 2) return;
    if (waveStyle === '平滑' || waveStyle === '平滑海面色') drawSmoothWave(ctx, waveIn, W, H, waveStyle === '平滑海面色');
    else drawPixelWave(ctx, waveIn, W, H, subdivision[waveStyle] ?? 1);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, pointerEvents: 'none' }} />;
};
