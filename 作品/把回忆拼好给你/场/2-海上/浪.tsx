// 第 4 句末尾「一道浪把画面卷走」：2D 浪从画面下沿涌上来盖满画面，再往上退出去露出下一镜。画法按 样式（参数.ts 的 浪样式名）：
// 像素版一格 浪格 个页面像素（减半、四分之一的格子更小，浪形、时刻不变），硬边，颜色分四层（浪色）；平滑版浪头、浪身连续，几层颜色平滑过渡，浪身上加横着的波纹和碎光。
// 进：0 还没起（看不见）→ 1 正好盖满 → 2 浪尾也退出画面上沿。第 4 句段里走 0 → 1（编排.ts 的 浪进），第 5 句接着走 1 → 2 就能从浪里出来。
// 放在 position 不是 static 的容器里，自己铺满 宽 × 高；画布按成片分辨率建。
import React, { useLayoutEffect, useRef } from 'react';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 浪形, 浪格, 浪碎光, 浪色, 浪色海面, type 浪样式名 } from './参数.ts';

// 固定的伪随机（同一格每帧一样）：浪身里零星的亮格
const 散 = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const 细分: Readonly<Record<string, number>> = { 像素: 1, 像素减半: 2, 像素四分之一: 4 };

/** 像素版：一格 浪格 ÷ s 个页面像素，浪形（振幅、波长、漂）和几层的厚度都按原来的格数 × s，所以浪的样子、走的快慢和 s = 1 一样，只是台阶更细 */
const 画像素浪 = (ctx: CanvasRenderingContext2D, 进: number, W: number, H: number, s: number) => {
  const c = (浪格 * 成片倍数) / s;
  const 列 = Math.ceil(W / c);
  const 行 = Math.ceil(H / c);
  const A = 浪形.振幅 * s;
  const 程 = 行 + 2 * A + 2 * s; // 浪头从画面下面 A+1 格走到上面 A+1 格（原来的格）
  const 起伏 = (i: number, 相: number) => A * Math.sin((2 * Math.PI * i) / (浪形.波长 * s) + 相);
  const 漂 = 进 * 浪形.漂 * s;
  for (let i = 0; i < 列; i++) {
    const 头 = Math.round((1 - Math.min(1, 进)) * 程 - A - s + 起伏(i + 漂, 0));
    const 尾 = 进 <= 1 ? Infinity : Math.round((2 - 进) * 程 - A - s + 起伏(i - 漂, 2.1));
    const 顶 = 起伏(i + 漂, 0) / A; // −1～1，浪尖上冒沫
    for (let j = Math.max(0, 头 - s); j < Math.min(行, 尾); j++) {
      const d = j - 头;
      let 色: string | null;
      if (d < 0) 色 = 顶 < -0.6 && (i + j) % 2 === 0 ? 浪色.沫 : null;
      else if (d < s) 色 = 浪色.沫;
      else if (d < 3 * s) 色 = 浪色.亮;
      else if (d < 8 * s) 色 = 散(i, j) < 0.06 ? 浪色.亮 : 浪色.身;
      else 色 = 散(i, j) < 0.04 ? 浪色.身 : 浪色.深;
      if (Number.isFinite(尾) && j >= 尾 - s) 色 = 浪色.亮;
      if (!色) continue;
      ctx.fillStyle = 色;
      ctx.fillRect(i * c, j * c, c, c);
    }
  }
};

const 拆 = (hex: string): [number, number, number] => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as [number, number, number];
const 夹 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const 缓 = (a: number, b: number, v: number) => {
  const t = 夹((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 平滑版：浪头、浪尾的位置照像素版的式子（不取整），按原来的格算深度 d（浪头往下几格），颜色按 d 平滑过渡：
 *  沫（0～1 格，下沿随横向起伏成花边）→ 亮（到 3 格）→ 身（到 8 格往后慢慢变深）→ 深；浪身上叠横着拉长的波纹（明暗）和几道细碎光，越近浪头越亮 */
const 画平滑浪 = (ctx: CanvasRenderingContext2D, 进: number, W: number, H: number, 海面色: boolean) => {
  const 色 = 海面色 ? 浪色海面 : { ...浪色, 光: 浪碎光 };
  const [沫, 亮, 身, 深, 光] = [色.沫, 色.亮, 色.身, 色.深, 色.光].map(拆) as [number, number, number][];
  const c = 浪格 * 成片倍数;
  const 行 = Math.ceil(H / c);
  const A = 浪形.振幅;
  const 程 = 行 + 2 * A + 2;
  const 起伏 = (x: number, 相: number) => A * Math.sin((2 * Math.PI * x) / 浪形.波长 + 相);
  const 漂 = 进 * 浪形.漂;
  const img = ctx.createImageData(W, H);
  const p = img.data;
  const 头们 = new Float32Array(W);
  const 尾们 = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / c;
    // 像素版第 i 列的浪头在 round(…起伏(i + 漂))，列中心 u = i + 0.5：这里取 u − 0.5，平滑版的浪头正好穿过像素版每一列台阶的中间
    头们[x] = (1 - Math.min(1, 进)) * 程 - A - 1 + 起伏(u - 0.5 + 漂, 0);
    尾们[x] = 进 <= 1 ? Infinity : (2 - 进) * 程 - A - 1 + 起伏(u - 0.5 - 漂, 2.1);
  }
  const 一像素 = 1 / c; // 一个画布像素是几格（抗锯齿的宽）
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / c;
    for (let x = 0; x < W; x++) {
      const 头 = 头们[x]!;
      const d = v - 头;
      if (d < -1.5 * 一像素) continue;
      const 尾 = 尾们[x]!;
      if (v > 尾 + 1.5 * 一像素) continue;
      const u = (x + 0.5) / c;
      // 沫的下沿：一格上下随横向起伏，成花边
      const 沫边 = 1 + 0.35 * Math.sin(u * 0.9 + 漂 * 0.37) * Math.sin(u * 0.23 - 漂 * 0.21);
      const 沫比 = 1 - 缓(沫边 - 0.25, 沫边 + 0.25, d);
      // 水：亮 → 身（3～6 格）→ 深（8～16 格）
      const k1 = 缓(2.2, 6, d);
      const k2 = 缓(7, 16, d);
      // 横着拉长的波纹：明暗起伏，越深越弱；碎光：几道细亮线，靠近浪头多、往下少
      const 纹 = Math.sin(v * 2.1 + 1.3 * Math.sin(u * 0.31 + 进 * 2.0) + 进 * 6) * Math.sin(u * 0.07 - v * 0.15 + 进 * 1.3);
      const 纹强 = 0.07 * (1 - 0.6 * k2);
      // 碎光是一截一截的短亮线（不连成整条），每条错开
      const 截 = 缓(0.45, 0.85, 0.5 + 0.5 * Math.sin(u * 0.62 + 3.1 * Math.sin(v * 0.83) + 进 * 4));
      const 闪 = Math.pow(Math.max(0, Math.sin(v * 3.3 + 2.2 * Math.sin(u * 0.19 - 进 * 3) + Math.sin(u * 0.043 + 1.1))), 14) * 截 * (1 - 缓(1.5, 10, d)) * 0.85;
      const a = 缓(-一像素, 一像素, d) * (Number.isFinite(尾) ? 1 - 缓(尾 - 一像素, 尾 + 一像素, v) : 1);
      if (a <= 0) continue;
      // 浪尾（退的时候）那一道亮边，同像素版最后一格是 亮
      const 尾亮 = Number.isFinite(尾) ? 1 - 缓(0.4, 1.4, 尾 - v) : 0;
      const o = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        let w = 亮[ch]! + (身[ch]! - 亮[ch]!) * k1;
        w = w + (深[ch]! - w) * k2;
        w = w * (1 + 纹强 * 纹);
        w = w + (光[ch]! - w) * 闪;
        w = w + (亮[ch]! - w) * 尾亮;
        w = w + (沫[ch]! - w) * 沫比;
        p[o + ch] = w;
      }
      p[o + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

export const 日落浪: React.FC<{ 进: number; 宽: number; 高: number; 样式?: 浪样式名 }> = ({ 进, 宽, 高, 样式 = '像素' }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数;
  const H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (进 <= 0 || 进 >= 2) return;
    if (样式 === '平滑' || 样式 === '平滑海面色') 画平滑浪(ctx, 进, W, H, 样式 === '平滑海面色');
    else 画像素浪(ctx, 进, W, H, 细分[样式] ?? 1);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, pointerEvents: 'none' }} />;
};
