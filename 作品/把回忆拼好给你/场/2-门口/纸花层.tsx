// 飘的纸和樱花瓣的叠层（算法在 纸花.ts）：一块 2D 画布，按贴图像素画（一个贴图像素 = 纸花参数.档 个成片像素），最近邻、只转 90° 的整数倍，同 特效/樱花风.tsx 的花瓣。
// 花瓣照原版 cherry_leaves 粒子的 12 张 3×3 贴图；纸是自画的 3×4 一张带横线的纸（W 纸、L 横线、S 侧着看的纸边、H 翻过来朝着光的纸背，白得发亮），
// 翻着飘时八个样子轮着换：正面 → 斜 → 侧成一条线 → 背面斜 → 背面一闪白 → …（核查 10-24：3×3 的纸认不出是纸；4×5 又比花瓣大两倍多，纸变不成花瓣，取 3×4）。
// 画布盖 页面 x [左, 左 + 宽)：分屏时两半各画一块（各自的调子包在外面，纸飘到分屏线哪边就是哪边的调子），合屏以后整页一块。放在 position 不是 static 的容器里，左上角对齐那一块。
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { png, type Png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 看得见, 纸花们, 纸花参数, 纸花在, type 纸形, type 纸花片 } from './纸花.ts';
import c0 from 'asset:贴图/粒子/樱花/cherry_0';
import c1 from 'asset:贴图/粒子/樱花/cherry_1';
import c2 from 'asset:贴图/粒子/樱花/cherry_2';
import c3 from 'asset:贴图/粒子/樱花/cherry_3';
import c4 from 'asset:贴图/粒子/樱花/cherry_4';
import c5 from 'asset:贴图/粒子/樱花/cherry_5';
import c6 from 'asset:贴图/粒子/樱花/cherry_6';
import c7 from 'asset:贴图/粒子/樱花/cherry_7';
import c8 from 'asset:贴图/粒子/樱花/cherry_8';
import c9 from 'asset:贴图/粒子/樱花/cherry_9';
import c10 from 'asset:贴图/粒子/樱花/cherry_10';
import c11 from 'asset:贴图/粒子/樱花/cherry_11';

const 瓣图们: readonly Png[] = [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11].map((u) => png(u));

/** 纸翻一圈的八个样子（居中在 3×4 里）。横轴翻：高度 4 → 2 → 1 → 2 → 4 → …；竖轴翻：宽度 3 → 2 → 1 → 2 → 3 → … */
const 纸宽 = 3;
const 纸高 = 4;
const 横翻: Record<纸形, readonly string[]> = {
  0: ['WWW', 'LLL', 'WWW', 'LLL'],
  1: ['WWW', 'LLL'],
  2: ['SSS'],
  3: ['HHH', 'HHH'],
  4: ['HHH', 'HHH', 'HHH', 'HHH'],
  5: ['HHH', 'HHH'],
  6: ['SSS'],
  7: ['WWW', 'LLL'],
};
const 竖翻: Record<纸形, readonly string[]> = {
  0: 横翻[0],
  1: ['WW', 'LL', 'WW', 'LL'],
  2: ['S', 'S', 'S', 'S'],
  3: ['HH', 'HH', 'HH', 'HH'],
  4: 横翻[4],
  5: ['HH', 'HH', 'HH', 'HH'],
  6: ['S', 'S', 'S', 'S'],
  7: ['WW', 'LL', 'WW', 'LL'],
};
const 纸色: Record<string, string> = { W: '#eef1f3', L: '#9aa6b2', S: '#b8c0c8', H: '#ffffff' };

/** 3×3 贴图转 转×90°、翻了再左右翻以后，第 (i, j) 格取原图哪一格（同 樱花风.tsx） */
const 取格 = (i: number, j: number, 转: number, 翻: boolean): [number, number] => {
  let [a, b] = [翻 ? 2 - i : i, j];
  for (let k = 0; k < 转; k++) [a, b] = [2 - b, a];
  return [a, b];
};

/** 取：这一块画哪些（分屏时她那边画花瓣、合屏起以后的纸，现实那边只画纸；一片纸压在分屏线上时两块各画一半） */
export const 纸花层: React.FC<{ 秒: number; 左?: number; 宽?: number; 高?: number; 取?: (q: 纸花片) => boolean }> = ({ 秒, 左 = 0, 宽 = 1280, 高 = 720, 取 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数;
  const H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const 档 = 纸花参数.档;
    const 边 = Math.max(纸宽, 纸高) * 档;
    for (const q of 纸花们()) {
      if (!看得见(q, 秒) || (取 && !取(q))) continue;
      const s = 纸花在(q, 秒);
      // 左上角吸到偶数成片像素（预览级一个画布像素是两个成片像素）
      const x0 = Math.round(((s.x - 左) * 成片倍数) / 2) * 2;
      const y0 = Math.round((s.y * 成片倍数) / 2) * 2;
      if (x0 + 边 <= 0 || x0 >= W || y0 + 边 <= 0 || y0 >= H) continue;
      if (q.种 === '纸') {
        const 图 = (q.轴 === '横' ? 横翻 : 竖翻)[s.形];
        const 上 = y0 + Math.floor((纸高 - 图.length) / 2) * 档;
        const 左边 = x0 + Math.floor((纸宽 - 图[0]!.length) / 2) * 档;
        图.forEach((行, j) =>
          [...行].forEach((c, i) => {
            ctx.fillStyle = 纸色[c]!;
            ctx.fillRect(左边 + i * 档, 上 + j * 档, 档, 档);
          }),
        );
      } else {
        const 图 = 瓣图们[q.图]!;
        for (let j = 0; j < 3; j++)
          for (let i = 0; i < 3; i++) {
            const [a, b] = 取格(i, j, s.转, q.翻);
            const k = (b * 图.w + a) * 4;
            if (图.px[k + 3]! < 128) continue;
            ctx.fillStyle = `rgb(${图.px[k]},${图.px[k + 1]},${图.px[k + 2]})`;
            ctx.fillRect(x0 + i * 档, y0 + j * 档, 档, 档);
          }
      }
    }
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, imageRendering: 'pixelated' }} />;
};
