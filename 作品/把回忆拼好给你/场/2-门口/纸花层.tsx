// 飘的碎纸和樱花瓣的叠层（算法在 纸花.ts）：一块 2D 画布，按贴图像素画（一个贴图像素 = 这一片的 档 个成片像素），平涂、最近邻、只转 90° 的整数倍、不描边，同 特效/樱花风.tsx 的花瓣。
// 花瓣照原版 cherry_leaves 粒子的 12 张 3×3 贴图。碎纸照 纸花.ts 的 碎图们，翻着飘：沿翻的轴压扁成 |cos| 那么长（最近邻取行），侧成一条线时画一道纸边，翻过去露背面
// （背面是正面沿翻轴的镜像，字行只透出一点影子）。碎纸一档一档变成樱花瓣（纸花.ts 的 档位）：第 0～2 档按 格们 的形状、颜色按 色进 一档比一档粉（几档定死的颜色，
// 不做平滑渐变）；第 3 档是樱花瓣的形状、颜色还偏白，跟花瓣一样转着飘；第 4 档就是原版樱花瓣（变成的那张贴图）。远处那档碎纸暗一点，先画。
// 画布盖 页面 x [左, 左 + 宽)：分屏时两半各画一块（各自的调子包在外面，碎纸飘到分屏线哪边就是哪边的调子），合屏以后整页一块。放在 position 不是 static 的容器里，左上角对齐那一块。
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { png, type Png } from '@engine/model/贴图.ts';
import { filmScale } from '@engine/三渲二/像素.ts';
import { tierCount, pieceFrame, isVisible, paperFlowers, paperParams, paperAt, type PaperPiece } from './纸花.ts';
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

const petalImages: readonly Png[] = [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11].map((u) => png(u));

type ColorSet = { 正: Record<string, string>; back: Record<string, string>; edgeColor: string };
/** 碎纸本来的颜色（第 0 档）：正面纸白、印的字行灰（碎纸小，字行比原来整页那版深一档才看得出是印着字的纸）、红笔；
 *  背面朝着光白得发亮，字行、红笔只透出一道浅影；侧成一条线时的纸边。远处那档整体暗一点（隔着空气），近处的白纸压在上面分得出层次（纸不描边，靠明暗分开）。Agent 暂定 */
const paperColorSets: Record<'近' | '远', ColorSet> = {
  近: { 正: { W: '#eef1f3', L: '#87929e', R: '#c4544a' }, back: { W: '#ffffff', L: '#d3d9de', R: '#e6d9d8' }, edgeColor: '#b8c0c8' },
  远: { 正: { W: '#d3d9de', L: '#939da8', R: '#b77a74' }, back: { W: '#e1e6ea', L: '#c3cad0', R: '#cdc2c1' }, edgeColor: '#a9b1b9' },
};

/** 第 0～3 档往变成的那张樱花贴图的底色靠多少（几档定死的颜色：碎纸本来的颜色和樱花底色按这个比例混一次，算出来就是那一档的调色板）。
 *  第 1 档就看得出泛粉，第 3 档（樱花瓣的形状）还差一点白，第 4 档才是原版的颜色。Agent 暂定 */
const tintSteps = [0, 0.3, 0.55, 0.8] as const;

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, k: number) =>
  `#${hexRgb(a)
    .map((v, i) => Math.round(v + (hexRgb(b)[i]! - v) * k).toString(16).padStart(2, '0'))
    .join('')}`;
const pixelColor = (img: Png, a: number, b: number) => {
  const k = (b * img.w + a) * 4;
  return img.px[k + 3]! < 128 ? null : `#${[0, 1, 2].map((c) => img.px[k + c]!.toString(16).padStart(2, '0')).join('')}`;
};
/** 一张樱花贴图的底色：中间那一格（材质包的 6×6 取中间偏左上那格） */
const baseColor = (k: number) => pixelColor(petalImages[k]!, (petalImages[k]!.w - 1) >> 1, (petalImages[k]!.w - 1) >> 1)!;

const colorMap = new Map<string, ColorSet>();
/** 第 档 档的调色板（碎纸 q，第 0～2 档）：碎纸本来的颜色往变成的樱花底色混 色进[档] */
const tierColor = (q: PaperPiece, tier: number): ColorSet => {
  const nearFar = q.档 === paperParams.nearTier ? '近' : '远';
  const cacheKey = `${nearFar}${q.petal}${tier}`;
  let color = colorMap.get(cacheKey);
  if (!color) {
    const originalColors = paperColorSets[nearFar];
    const pink = baseColor(q.petal);
    const recolor = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([c, v]) => [c, mix(v, pink, tintSteps[tier]!)]));
    color = { 正: recolor(originalColors.正), back: recolor(originalColors.back), edgeColor: mix(originalColors.edgeColor, pink, tintSteps[tier]!) };
    colorMap.set(cacheKey, color);
  }
  return color;
};

/** n×n 贴图（原版 3×3；材质包 32x 是 6×6）转 转×90°、翻了再左右翻以后，第 (i, j) 格取原图哪一格（同 樱花风.tsx） */
const pickCell = (i: number, j: number, quarterTurns: number, flip: boolean, n = 3): [number, number] => {
  let [a, b] = [flip ? n - 1 - i : i, j];
  for (let k = 0; k < quarterTurns; k++) [a, b] = [n - 1 - b, a];
  return [a, b];
};

/** 碎纸的格子转 转×90°（顺时针）、翻了再左右镜像以后（行的数组） */
const straighten = (imgRows: readonly string[], quarterTurns: number, flip: boolean): string[] => {
  let g = imgRows.map((row) => [...row]);
  if (flip) g = g.map((row) => [...row].reverse());
  for (let k = 0; k < quarterTurns; k++) g = g[0]!.map((_, i) => g.map((row) => row[i]!).reverse());
  return g.map((row) => row.join(''));
};

/** 一片碎纸（第 0～2 档）在 (x0, y0) 画（左上角，画布像素）：按 翻 沿 轴 压扁，背面朝前时沿轴镜像、换背面的颜色 */
const drawShredPaper = (ctx: CanvasRenderingContext2D, q: PaperPiece, tier: number, flipCos: number, x0: number, y0: number) => {
  const tierWidth = q.档;
  const g = straighten(q.cells[tier]!, q.转, q.flip);
  const [W, H] = [g[0]!.length, g.length];
  const isHorizontal = q.axis === '横';
  const L = isHorizontal ? H : W;
  const n = Math.round(L * Math.abs(flipCos));
  // 压扁以后居中（绕纸的中线翻）
  const startRow = Math.floor((L - Math.max(n, 1)) / 2);
  const pieceColors = tierColor(q, tier);
  if (n === 0) {
    ctx.fillStyle = pieceColors.edgeColor;
    if (isHorizontal) ctx.fillRect(x0, y0 + startRow * tierWidth, W * tierWidth, tierWidth);
    else ctx.fillRect(x0 + startRow * tierWidth, y0, tierWidth, H * tierWidth);
    return;
  }
  const isBack = flipCos < 0;
  const color = isBack ? pieceColors.back : pieceColors.正;
  for (let k = 0; k < n; k++) {
    // 第 k 行（列）取原图哪一行（列）：最近邻；背面朝前时沿翻轴镜像
    let s = Math.floor(((k + 0.5) * L) / n);
    if (isBack) s = L - 1 - s;
    for (let m = 0; m < (isHorizontal ? W : H); m++) {
      const c = isHorizontal ? g[s]![m]! : g[m]![s]!;
      if (c === '.') continue;
      ctx.fillStyle = color[c]!;
      if (isHorizontal) ctx.fillRect(x0 + m * tierWidth, y0 + (startRow + k) * tierWidth, tierWidth, tierWidth);
      else ctx.fillRect(x0 + (startRow + k) * tierWidth, y0 + m * tierWidth, tierWidth, tierWidth);
    }
  }
};

/** 一片樱花瓣（原版 3×3，转 转×90°）在 (x0, y0) 画；偏白 = 碎纸变的第 3 档，颜色往纸白混回 1 − 色进[3]。
 *  档宽 是原版一个贴图像素的大小；材质包的高清贴图（n > 3）一格是它的 3/n，整片一样大（碎纸是自己画的格子，照旧按 档宽） */
const drawPetal = (ctx: CanvasRenderingContext2D, k: number, tierWidth: number, quarterTurns: number, flip: boolean, x0: number, y0: number, tintWhite: boolean) => {
  const petalImg = petalImages[k]!;
  const n = petalImg.w;
  const cellSize = (tierWidth * 3) / n;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const [a, b] = pickCell(i, j, quarterTurns, flip, n);
      const c = pixelColor(petalImg, a, b);
      if (!c) continue;
      ctx.fillStyle = tintWhite ? mix(paperColorSets.近.正.W!, c, tintSteps[3]) : c;
      ctx.fillRect(x0 + i * cellSize, y0 + j * cellSize, cellSize, cellSize);
    }
};

/** 吸到偶数成片像素（预览级一个画布像素是两个成片像素） */
const snap = (pageLen: number) => Math.round((pageLen * filmScale) / 2) * 2;

/** 取：这一块画哪些（分屏时现实那边只画碎纸；一片压在分屏线上时两块各画一半） */
export const PaperLayer: React.FC<{ sec: number; left?: number; width?: number; height?: number; 取?: (q: PaperPiece) => boolean }> = ({ sec: sec, left = 0, width: width = 1280, height: height = 720, 取: pick }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = width * filmScale;
  const H = height * filmScale;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const q of paperFlowers()) {
      if (!isVisible(q, sec) || (pick && !pick(q))) continue;
      const s = paperAt(q, sec);
      const paperSize = pieceFrame(q);
      const x0 = snap(s.x - left);
      const y0 = snap(s.y);
      if (x0 + paperSize.width * filmScale <= 0 || x0 >= W || y0 + paperSize.height * filmScale <= 0 || y0 >= H) continue;
      if (q.kind === '瓣') drawPetal(ctx, q.image, q.档, s.转, q.flip, x0, y0, false);
      else if (s.档 < tierCount - 1) drawShredPaper(ctx, q, s.档, s.flipCos, x0, y0);
      else {
        // 樱花瓣的形状画在碎纸外框正中
        const halfSize = (1.5 * q.档) / filmScale;
        drawPetal(ctx, q.petal, q.档, s.转, q.flip, snap(s.x - left + paperSize.width / 2 - halfSize), snap(s.y + paperSize.height / 2 - halfSize), s.档 < tierCount);
      }
    }
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, imageRendering: 'pixelated' }} />;
};
