// 飘的纸和樱花瓣的叠层（算法在 纸花.ts）：一块 2D 画布，按贴图像素画（一个贴图像素 = 纸花参数.档 个成片像素），最近邻、只转 90° 的整数倍，同 特效/樱花风.tsx 的花瓣。
// 花瓣照原版 cherry_leaves 粒子的 12 张 3×3 贴图；纸是自画的 3 像素宽一张（W 纸、L 印的字、S 侧着看的边），翻着飘时四个形状轮着换。
// 画布盖 页面 x [左, 左 + 宽)：分屏时两半各画一块（各自的调子包在外面），合屏以后整页一块。放在 position 不是 static 的容器里，左上角对齐那一块。
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { png, type Png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 看得见, 纸花们, 纸花参数, 纸花在, type 纸形 } from './纸花.ts';
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

/** 纸的四个形状（竖着居中在 3×3 里）：平、斜、侧、斜（反） */
const 纸形们: Record<纸形, readonly string[]> = {
  0: ['WWW', 'WLW', 'WWW'],
  1: ['WWW', 'SSS'],
  2: ['SSS'],
  3: ['SSS', 'WWW'],
};
const 纸色: Record<string, string> = { W: '#f1f3f4', L: '#9aa3ab', S: '#c3c9cf' };

/** 3×3 贴图转 转×90°、翻了再左右翻以后，第 (i, j) 格取原图哪一格（同 樱花风.tsx） */
const 取格 = (i: number, j: number, 转: number, 翻: boolean): [number, number] => {
  let [a, b] = [翻 ? 2 - i : i, j];
  for (let k = 0; k < 转; k++) [a, b] = [2 - b, a];
  return [a, b];
};

export const 纸花层: React.FC<{ 秒: number; 左?: number; 宽?: number; 高?: number }> = ({ 秒, 左 = 0, 宽 = 1280, 高 = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数;
  const H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const 档 = 纸花参数.档;
    const 边 = 3 * 档;
    for (const q of 纸花们()) {
      if (!看得见(q, 秒)) continue;
      const s = 纸花在(q, 秒);
      // 左上角吸到偶数成片像素（预览级一个画布像素是两个成片像素）
      const x0 = Math.round(((s.x - 左) * 成片倍数) / 2) * 2;
      const y0 = Math.round((s.y * 成片倍数) / 2) * 2;
      if (x0 + 边 <= 0 || x0 >= W || y0 + 边 <= 0 || y0 >= H) continue;
      if (q.种 === '纸') {
        const 图 = 纸形们[s.形];
        const 上 = y0 + Math.floor((3 - 图.length) / 2) * 档;
        图.forEach((行, j) =>
          [...行].forEach((c, i) => {
            ctx.fillStyle = 纸色[c]!;
            ctx.fillRect(x0 + i * 档, 上 + j * 档, 档, 档);
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
