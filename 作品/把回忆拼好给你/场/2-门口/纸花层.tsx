// 飘的碎纸和樱花瓣的叠层（算法在 纸花.ts）：一块 2D 画布，按贴图像素画（一个贴图像素 = 这一片的 档 个成片像素），平涂、最近邻、只转 90° 的整数倍、不描边，同 特效/樱花风.tsx 的花瓣。
// 花瓣照原版 cherry_leaves 粒子的 12 张 3×3 贴图。碎纸照 纸花.ts 的 碎图们，翻着飘：沿翻的轴压扁成 |cos| 那么长（最近邻取行），侧成一条线时画一道纸边，翻过去露背面
// （背面是正面沿翻轴的镜像，字行只透出一点影子）。碎纸一档一档变成樱花瓣（纸花.ts 的 档位）：第 0～2 档按 格们 的形状、颜色按 色进 一档比一档粉（几档定死的颜色，
// 不做平滑渐变）；第 3 档是樱花瓣的形状、颜色还偏白，跟花瓣一样转着飘；第 4 档就是原版樱花瓣（变成的那张贴图）。远处那档碎纸暗一点，先画。
// 画布盖 页面 x [左, 左 + 宽)：分屏时两半各画一块（各自的调子包在外面，碎纸飘到分屏线哪边就是哪边的调子），合屏以后整页一块。放在 position 不是 static 的容器里，左上角对齐那一块。
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { png, type Png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 变档数, 片框, 看得见, 纸花们, 纸花参数, 纸花在, type 纸花片 } from './纸花.ts';
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

type 色组 = { 正: Record<string, string>; 背: Record<string, string>; 边: string };
/** 碎纸本来的颜色（第 0 档）：正面纸白、印的字行灰（碎纸小，字行比原来整页那版深一档才看得出是印着字的纸）、红笔；
 *  背面朝着光白得发亮，字行、红笔只透出一道浅影；侧成一条线时的纸边。远处那档整体暗一点（隔着空气），近处的白纸压在上面分得出层次（纸不描边，靠明暗分开）。Agent 暂定 */
const 纸色们: Record<'近' | '远', 色组> = {
  近: { 正: { W: '#eef1f3', L: '#87929e', R: '#c4544a' }, 背: { W: '#ffffff', L: '#d3d9de', R: '#e6d9d8' }, 边: '#b8c0c8' },
  远: { 正: { W: '#d3d9de', L: '#939da8', R: '#b77a74' }, 背: { W: '#e1e6ea', L: '#c3cad0', R: '#cdc2c1' }, 边: '#a9b1b9' },
};

/** 第 0～3 档往变成的那张樱花贴图的底色靠多少（几档定死的颜色：碎纸本来的颜色和樱花底色按这个比例混一次，算出来就是那一档的调色板）。
 *  第 1 档就看得出泛粉，第 3 档（樱花瓣的形状）还差一点白，第 4 档才是原版的颜色。Agent 暂定 */
const 色进 = [0, 0.3, 0.55, 0.8] as const;

const 十六 = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const 混 = (a: string, b: string, k: number) =>
  `#${十六(a)
    .map((v, i) => Math.round(v + (十六(b)[i]! - v) * k).toString(16).padStart(2, '0'))
    .join('')}`;
const 像素色 = (图: Png, a: number, b: number) => {
  const k = (b * 图.w + a) * 4;
  return 图.px[k + 3]! < 128 ? null : `#${[0, 1, 2].map((c) => 图.px[k + c]!.toString(16).padStart(2, '0')).join('')}`;
};
/** 一张樱花贴图的底色：中间那一格 */
const 底色 = (k: number) => 像素色(瓣图们[k]!, 1, 1)!;

const 色表 = new Map<string, 色组>();
/** 第 档 档的调色板（碎纸 q，第 0～2 档）：碎纸本来的颜色往变成的樱花底色混 色进[档] */
const 档色 = (q: 纸花片, 档: number): 色组 => {
  const 远近 = q.档 === 纸花参数.近档 ? '近' : '远';
  const 键 = `${远近}${q.瓣}${档}`;
  let 色 = 色表.get(键);
  if (!色) {
    const 原 = 纸色们[远近];
    const 粉 = 底色(q.瓣);
    const 换 = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([c, v]) => [c, 混(v, 粉, 色进[档]!)]));
    色 = { 正: 换(原.正), 背: 换(原.背), 边: 混(原.边, 粉, 色进[档]!) };
    色表.set(键, 色);
  }
  return 色;
};

/** 3×3 贴图转 转×90°、翻了再左右翻以后，第 (i, j) 格取原图哪一格（同 樱花风.tsx） */
const 取格 = (i: number, j: number, 转: number, 翻: boolean): [number, number] => {
  let [a, b] = [翻 ? 2 - i : i, j];
  for (let k = 0; k < 转; k++) [a, b] = [2 - b, a];
  return [a, b];
};

/** 碎纸的格子转 转×90°（顺时针）、翻了再左右镜像以后（行的数组） */
const 摆正 = (图: readonly string[], 转: number, 翻: boolean): string[] => {
  let g = 图.map((行) => [...行]);
  if (翻) g = g.map((行) => [...行].reverse());
  for (let k = 0; k < 转; k++) g = g[0]!.map((_, i) => g.map((行) => 行[i]!).reverse());
  return g.map((行) => 行.join(''));
};

/** 一片碎纸（第 0～2 档）在 (x0, y0) 画（左上角，画布像素）：按 翻 沿 轴 压扁，背面朝前时沿轴镜像、换背面的颜色 */
const 画碎纸 = (ctx: CanvasRenderingContext2D, q: 纸花片, 档: number, 翻余弦: number, x0: number, y0: number) => {
  const 档宽 = q.档;
  const g = 摆正(q.格们[档]!, q.转, q.翻);
  const [W, H] = [g[0]!.length, g.length];
  const 横 = q.轴 === '横';
  const L = 横 ? H : W;
  const n = Math.round(L * Math.abs(翻余弦));
  // 压扁以后居中（绕纸的中线翻）
  const 起 = Math.floor((L - Math.max(n, 1)) / 2);
  const 色们 = 档色(q, 档);
  if (n === 0) {
    ctx.fillStyle = 色们.边;
    if (横) ctx.fillRect(x0, y0 + 起 * 档宽, W * 档宽, 档宽);
    else ctx.fillRect(x0 + 起 * 档宽, y0, 档宽, H * 档宽);
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
      if (横) ctx.fillRect(x0 + m * 档宽, y0 + (起 + k) * 档宽, 档宽, 档宽);
      else ctx.fillRect(x0 + (起 + k) * 档宽, y0 + m * 档宽, 档宽, 档宽);
    }
  }
};

/** 一片樱花瓣（3×3，转 转×90°）在 (x0, y0) 画；偏白 = 碎纸变的第 3 档，颜色往纸白混回 1 − 色进[3] */
const 画瓣 = (ctx: CanvasRenderingContext2D, k: number, 档宽: number, 转: number, 翻: boolean, x0: number, y0: number, 偏白: boolean) => {
  const 图 = 瓣图们[k]!;
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      const [a, b] = 取格(i, j, 转, 翻);
      const c = 像素色(图, a, b);
      if (!c) continue;
      ctx.fillStyle = 偏白 ? 混(纸色们.近.正.W!, c, 色进[3]) : c;
      ctx.fillRect(x0 + i * 档宽, y0 + j * 档宽, 档宽, 档宽);
    }
};

/** 吸到偶数成片像素（预览级一个画布像素是两个成片像素） */
const 吸 = (页: number) => Math.round((页 * 成片倍数) / 2) * 2;

/** 取：这一块画哪些（分屏时现实那边只画碎纸；一片压在分屏线上时两块各画一半） */
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
      const x0 = 吸(s.x - 左);
      const y0 = 吸(s.y);
      if (x0 + 框.宽 * 成片倍数 <= 0 || x0 >= W || y0 + 框.高 * 成片倍数 <= 0 || y0 >= H) continue;
      if (q.种 === '瓣') 画瓣(ctx, q.图, q.档, s.转, q.翻, x0, y0, false);
      else if (s.档 < 变档数 - 1) 画碎纸(ctx, q, s.档, s.翻, x0, y0);
      else {
        // 樱花瓣的形状画在碎纸外框正中
        const 半 = (1.5 * q.档) / 成片倍数;
        画瓣(ctx, q.瓣, q.档, s.转, q.翻, 吸(s.x - 左 + 框.宽 / 2 - 半), 吸(s.y + 框.高 / 2 - 半), s.档 < 变档数);
      }
    }
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, imageRendering: 'pixelated' }} />;
};
