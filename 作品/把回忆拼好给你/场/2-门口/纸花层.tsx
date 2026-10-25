// 飘的纸和樱花瓣的叠层（算法在 纸花.ts）：一块 2D 画布，按贴图像素画（一个贴图像素 = 这一片的 档 个成片像素），最近邻、只转 90° 的整数倍，同 特效/樱花风.tsx 的花瓣。
// 花瓣照原版 cherry_leaves 粒子的 12 张 3×3 贴图；纸照 纸花.ts 的 纸图们（撕下来的书页、卷子），翻着飘：沿翻的轴压扁成 |cos| 那么长（最近邻取行），
// 侧成一条线时画一道纸边，翻过去露背面（白得发亮，字行只透出一点影子；背面是正面沿翻轴的镜像）。正面、侧面、背面一圈圈轮着换（用户 10-25「看不出是撕下来的纸片」）。
// 纸有近、远两档（纸花参数.近档、远档），远的小一半、暗一点，先画。
// 画布盖 页面 x [左, 左 + 宽)：分屏时两半各画一块（各自的调子包在外面，纸飘到分屏线哪边就是哪边的调子），合屏以后整页一块。放在 position 不是 static 的容器里，左上角对齐那一块。
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { png, type Png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 片框, 看得见, 纸图们, 纸花们, 纸花参数, 纸花在, type 纸花片 } from './纸花.ts';
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

/** 纸的颜色（Agent 暂定）：正面纸白、印的字行浅灰（深了一页纸看着像一个方块字）、红笔；背面朝着光白得发亮，字行、红笔只透出一道浅影；侧成一条线时的纸边。
 *  远处那档整体暗一点（隔着空气），近处的白纸压在上面分得出层次（纸不描边，靠明暗分开） */
const 纸色们: Record<'近' | '远', { 正: Record<string, string>; 背: Record<string, string>; 边: string }> = {
  近: { 正: { W: '#eef1f3', L: '#a3adb7', R: '#c4544a' }, 背: { W: '#ffffff', L: '#dfe4e8', R: '#e6d9d8' }, 边: '#b8c0c8' },
  远: { 正: { W: '#d3d9de', L: '#a7b0b9', R: '#b77a74' }, 背: { W: '#e1e6ea', L: '#c8cfd5', R: '#cdc2c1' }, 边: '#a9b1b9' },
};

/** 3×3 贴图转 转×90°、翻了再左右翻以后，第 (i, j) 格取原图哪一格（同 樱花风.tsx） */
const 取格 = (i: number, j: number, 转: number, 翻: boolean): [number, number] => {
  let [a, b] = [翻 ? 2 - i : i, j];
  for (let k = 0; k < 转; k++) [a, b] = [2 - b, a];
  return [a, b];
};

/** 纸图转 转×90°（顺时针）、翻了再左右镜像以后的格子（行的数组） */
const 摆正 = (图: readonly string[], 转: number, 翻: boolean): string[] => {
  let g = 图.map((行) => [...行]);
  if (翻) g = g.map((行) => [...行].reverse());
  for (let k = 0; k < 转; k++) g = g[0]!.map((_, i) => g.map((行) => 行[i]!).reverse());
  return g.map((行) => 行.join(''));
};

/** 一片纸在 (x0, y0) 画（左上角，画布像素）：按 翻 沿 轴 压扁，背面朝前时沿轴镜像、换背面的颜色 */
const 画纸 = (ctx: CanvasRenderingContext2D, q: 纸花片, 翻余弦: number, x0: number, y0: number) => {
  const 档 = q.档;
  const g = 摆正(纸图们[q.图]!, q.转, q.翻);
  const [W, H] = [g[0]!.length, g.length];
  const 横 = q.轴 === '横';
  const L = 横 ? H : W;
  const n = Math.round(L * Math.abs(翻余弦));
  // 压扁以后居中（绕纸的中线翻）
  const 起 = Math.floor((L - Math.max(n, 1)) / 2);
  const 色们 = 纸色们[档 === 纸花参数.近档 ? '近' : '远'];
  if (n === 0) {
    ctx.fillStyle = 色们.边;
    if (横) ctx.fillRect(x0, y0 + 起 * 档, W * 档, 档);
    else ctx.fillRect(x0 + 起 * 档, y0, 档, H * 档);
    return;
  }
  const 背 = 翻余弦 < 0;
  const 色 = 背 ? 色们.背 : 色们.正;
  for (let k = 0; k < n; k++) {
    // 第 k 行（列）取原图哪一行（列）：最近邻；背面朝前时沿翻轴镜像
    let s = Math.floor(((k + 0.5) * L) / n);
    if (背) s = L - 1 - s;
    for (let m = 0; m < (横 ? W : H); m++) {
      const c = 横 ? g[s]![m]! : g[m]![s]!;
      if (c === '.') continue;
      ctx.fillStyle = 色[c]!;
      if (横) ctx.fillRect(x0 + m * 档, y0 + (起 + k) * 档, 档, 档);
      else ctx.fillRect(x0 + (起 + k) * 档, y0 + m * 档, 档, 档);
    }
  }
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
    for (const q of 纸花们()) {
      if (!看得见(q, 秒) || (取 && !取(q))) continue;
      const s = 纸花在(q, 秒);
      const 框 = 片框(q);
      // 左上角吸到偶数成片像素（预览级一个画布像素是两个成片像素）
      const x0 = Math.round(((s.x - 左) * 成片倍数) / 2) * 2;
      const y0 = Math.round((s.y * 成片倍数) / 2) * 2;
      if (x0 + 框.宽 * 成片倍数 <= 0 || x0 >= W || y0 + 框.高 * 成片倍数 <= 0 || y0 >= H) continue;
      if (q.种 === '纸') {
        画纸(ctx, q, s.翻, x0, y0);
      } else {
        const 档 = q.档;
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
