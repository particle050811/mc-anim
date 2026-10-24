// 第 4 句末尾「一道浪把画面卷走」：2D 像素浪从画面下沿涌上来盖满画面，再往上退出去露出下一镜。一格 浪格 个页面像素，硬边，颜色分四层（参数.ts 的 浪色）。
// 进：0 还没起（看不见）→ 1 正好盖满 → 2 浪尾也退出画面上沿。第 4 句段里走 0 → 1（编排.ts 的 浪进），第 5 句接着走 1 → 2 就能从浪里出来。
// 放在 position 不是 static 的容器里，自己铺满 宽 × 高；画布按成片分辨率建。
import React, { useLayoutEffect, useRef } from 'react';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 浪形, 浪格, 浪色 } from './参数.ts';

// 固定的伪随机（同一格每帧一样）：浪身里零星的亮格
const 散 = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export const 日落浪: React.FC<{ 进: number; 宽: number; 高: number }> = ({ 进, 宽, 高 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数;
  const H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (进 <= 0 || 进 >= 2) return;
    const c = 浪格 * 成片倍数;
    const 列 = Math.ceil(W / c);
    const 行 = Math.ceil(H / c);
    const A = 浪形.振幅;
    const 程 = 行 + 2 * A + 2; // 浪头从画面下面 A+1 格走到上面 A+1 格
    const 起伏 = (i: number, 相: number) => A * Math.sin((2 * Math.PI * i) / 浪形.波长 + 相);
    const 漂 = 进 * 浪形.漂;
    for (let i = 0; i < 列; i++) {
      const 头 = Math.round((1 - Math.min(1, 进)) * 程 - A - 1 + 起伏(i + 漂, 0));
      const 尾 = 进 <= 1 ? Infinity : Math.round((2 - 进) * 程 - A - 1 + 起伏(i - 漂, 2.1));
      const 顶 = 起伏(i + 漂, 0) / A; // −1～1，浪尖上冒沫
      for (let j = Math.max(0, 头 - 1); j < Math.min(行, 尾); j++) {
        const d = j - 头;
        let 色: string | null;
        if (d < 0) 色 = 顶 < -0.6 && (i + j) % 2 === 0 ? 浪色.沫 : null;
        else if (d === 0) 色 = 浪色.沫;
        else if (d <= 2) 色 = 浪色.亮;
        else if (d <= 7) 色 = 散(i, j) < 0.06 ? 浪色.亮 : 浪色.身;
        else 色 = 散(i, j) < 0.04 ? 浪色.身 : 浪色.深;
        if (Number.isFinite(尾) && j === 尾 - 1) 色 = 浪色.亮;
        if (!色) continue;
        ctx.fillStyle = 色;
        ctx.fillRect(i * c, j * c, c, c);
      }
    }
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, pointerEvents: 'none' }} />;
};
