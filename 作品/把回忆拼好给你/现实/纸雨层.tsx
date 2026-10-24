// 纸雨的叠层（算法在 纸雨.ts）：一张铺满整页的画布，纸片按贴图像素画（一个纸像素 = 像素 个成片像素，落在右屏的像素网格上），最近邻、不转角度。
// 普通纸片只画在 裁 框里（右屏、栏杆顶以上：掉到栏杆顶以下就被栏杆挡住）；飘过分屏线的那一张不裁，过了线换成原版樱花粒子的一片花瓣（同樱花风的画法）。
// 放在铺满画面、position 不是 static 的容器里，盖在两屏上面、樱花风下面。
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import type { 纸形, 纸片 } from './纸雨.ts';
import { 纸片在 } from './纸雨.ts';
import 瓣url from 'asset:贴图/粒子/樱花/cherry_5';

const 瓣图 = png(瓣url);

// 四个形状（纸像素，. 透明、W 纸、L 字、S 侧面的影）：平、斜、侧、斜（反）
const 形们: Record<纸形, readonly string[]> = {
  0: ['WWWWW', 'WLLLW', 'WWWWW', 'WLLWW'],
  1: ['WWWWW', 'SSSSS'],
  2: ['SSSSS'],
  3: ['SSSSS', 'WWWWW'],
};
const 色: Record<string, string> = { W: '#f1f3f4', L: '#a3abb2', S: '#c6ccd1' };

export type 纸雨层属性 = {
  秒: number;
  片们: readonly 纸片[];
  风起: number;
  /** 画面格 → 页面坐标 */
  投: (x: number, z: number) => { x: number; y: number };
  /** 一个纸像素几个成片像素（右屏的 N）；网格原点（页面 x，右屏左沿） */
  像素: number;
  网格x: number;
  /** 普通纸片画在页面 x ≥ 左、y ≤ 下 的地方 */
  裁: { 左: number; 下: number };
  /** 飘过分屏线的那一张（纸雨.ts 的 飘纸在），没有给 null；瓣档 = 变成花瓣以后一个粒子像素几个成片像素 */
  飘: { x: number; z: number; 成瓣: boolean; 形: 纸形 } | null;
  瓣档: number;
  宽?: number;
  高?: number;
};

export const 纸雨层: React.FC<纸雨层属性> = ({ 秒, 片们, 风起, 投, 像素, 网格x, 裁, 飘, 瓣档, 宽 = 1280, 高 = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数;
  const H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const 吸 = (v: number, 原: number) => Math.round((v - 原) / 像素) * 像素 + 原;
    const 画纸 = (x: number, z: number, 形: 纸形, 裁了: boolean) => {
      const p = 投(x, z);
      const 图 = 形们[形];
      const x0 = 吸(p.x * 成片倍数 - (图[0]!.length * 像素) / 2, 网格x * 成片倍数);
      const y0 = 吸(p.y * 成片倍数 - (图.length * 像素) / 2, 0);
      图.forEach((行, j) =>
        [...行].forEach((c, i) => {
          if (c === '.') return;
          const [px, py] = [x0 + i * 像素, y0 + j * 像素];
          if (裁了 && (px < 裁.左 * 成片倍数 || py + 像素 > 裁.下 * 成片倍数)) return;
          ctx.fillStyle = 色[c]!;
          ctx.fillRect(px, py, 像素, 像素);
        }),
      );
    };
    for (const q of 片们) {
      const s = 纸片在(q, 秒, 风起);
      if (s) 画纸(s.x, s.z, s.形, true);
    }
    if (飘) {
      if (!飘.成瓣) 画纸(飘.x, 飘.z, 飘.形, false);
      else {
        const p = 投(飘.x, 飘.z);
        const x0 = Math.round((p.x * 成片倍数 - 1.5 * 瓣档) / 2) * 2;
        const y0 = Math.round((p.y * 成片倍数 - 1.5 * 瓣档) / 2) * 2;
        for (let j = 0; j < 3; j++)
          for (let i = 0; i < 3; i++) {
            const k = (j * 瓣图.w + i) * 4;
            if (瓣图.px[k + 3]! < 128) continue;
            ctx.fillStyle = `rgb(${瓣图.px[k]},${瓣图.px[k + 1]},${瓣图.px[k + 2]})`;
            ctx.fillRect(x0 + i * 瓣档, y0 + j * 瓣档, 瓣档, 瓣档);
          }
      }
    }
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, imageRendering: 'pixelated' }} />;
};
