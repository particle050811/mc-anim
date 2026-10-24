// 龙蛋瞬移的紫色粒子带走画面（三稿第 5 句的转场；第 6 句接着用它散开）：画面切成一格格（成片 80 像素一格、32×18 格），
// 从 原点（蛋在画面上的位置）往外，每一格先冒出一颗原版传送粒子（generic_0 → generic_7 一帧帧长大，同 PortalParticle 由小变大），长满就成一整格。
// 颜色照 PortalParticle：(0.9, 0.3, 1.0) × 随机亮度 0.4～1，每格一个亮度。进 = 1 时整屏铺满。散 是反过来：各格按随机顺序缩回去、露出下面。
// 贴图一个像素 = 成片 10 像素，格子从画布左上角对齐成片像素网格。2D 叠层，放在三维画布上面、歌词下面（一起过整片后期）。
// 格子大小、先后的分寸都是 Agent 暂定。
import React, { useLayoutEffect, useRef } from 'react';
import { png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import g0 from 'asset:贴图/特效/粒子/generic_0';
import g1 from 'asset:贴图/特效/粒子/generic_1';
import g2 from 'asset:贴图/特效/粒子/generic_2';
import g3 from 'asset:贴图/特效/粒子/generic_3';
import g4 from 'asset:贴图/特效/粒子/generic_4';
import g5 from 'asset:贴图/特效/粒子/generic_5';
import g6 from 'asset:贴图/特效/粒子/generic_6';
import g7 from 'asset:贴图/特效/粒子/generic_7';

/** 一格多少成片像素；粒子贴图 8 像素，一个贴图像素 = 格 / 8 */
export const 转场格 = 80;
/** 一格从冒头到长满占整个进度的几成；先后：离原点的远近占 远近权，再加 随机权 的乱序（两项加 长 不超过 1，进 = 1 时全满） */
const 长 = 0.06;
const 远近权 = 0.78;
const 随机权 = 0.16;

const 粒子图们 = [g0, g1, g2, g3, g4, g5, g6, g7].map((u) => {
  const p = png(u);
  const 点: [number, number][] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.px[(y * p.w + x) * 4 + 3]! > 127) 点.push([x, y]);
  return 点;
});

/** 每格的定数随机（0～1） */
const 散列 = (i: number, j: number, 种: number) => {
  let h = (i * 374761393 + j * 668265263 + 种 * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

export type 龙蛋转场参数 = {
  /** 页面尺寸（1280×720 那套） */
  宽: number;
  高: number;
  /** 从哪儿涌出来（页面像素） */
  原点: { x: number; y: number };
  /** 0～1：铺的进度，1 = 铺满 */
  进: number;
  /** 0～1：散的进度，1 = 散完（第 6 句用） */
  散?: number;
};

export const 龙蛋转场: React.FC<龙蛋转场参数> = ({ 宽, 高, 原点, 进, 散 = 0 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数, H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (进 <= 0 || 散 >= 1) return;
    const 列 = Math.ceil(W / 转场格), 行 = Math.ceil(H / 转场格);
    const ox = 原点.x * 成片倍数, oy = 原点.y * 成片倍数;
    const 最远 = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x! - ox, y! - oy)));
    const 像 = 转场格 / 8;
    for (let i = 0; i < 列; i++)
      for (let j = 0; j < 行; j++) {
        const cx = (i + 0.5) * 转场格, cy = (j + 0.5) * 转场格;
        const 到 = 远近权 * (Math.hypot(cx - ox, cy - oy) / 最远) + 随机权 * 散列(i, j, 1);
        const 退 = (1 - 长) * 散列(i, j, 3);
        // 大小 0～1：长到 1 是一整格；散的时候按另一个随机顺序缩回去
        const 大 = Math.min((进 - 到) / 长, (退 + 长 - 散) / 长);
        if (大 <= 0) continue;
        const 亮 = 散列(i, j, 2) * 0.6 + 0.4;
        ctx.fillStyle = `rgb(${Math.round(229.5 * 亮)},${Math.round(76.5 * 亮)},${Math.round(255 * 亮)})`;
        const x0 = i * 转场格, y0 = j * 转场格;
        if (大 >= 1) {
          ctx.fillRect(x0, y0, 转场格, 转场格);
          continue;
        }
        for (const [px, py] of 粒子图们[Math.min(7, Math.floor(大 * 8))]!) ctx.fillRect(x0 + px * 像, y0 + py * 像, 像, 像);
      }
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};
