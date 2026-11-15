// 樱花风（第 15 句：门口摇响寻风之铃，一阵樱花风从铃那里卷起来，卷到盖满画面就转场，到隐世之境门口散开）。2D，盖在镜头上面、整片后期里面。
// 花瓣照原版 cherry_leaves 粒子的 12 张 3×3 贴图（贴图/粒子/樱花/cherry_0～11），按贴图像素整数倍放大、只转 90° 的整数倍，
// 最近邻画在成片分辨率的画布上，和三渲二的像素一样硬（05-画风 原则 3）；原版粒子 0.1～0.15 格大、慢慢飘，这里是演绎：大、快、成团。
// 两种花瓣：
// - 风流：从 源（铃在画面上的位置）一路往外打着旋卷，越卷越大、越往右飘；
// - 风墙：盖满画面的那一层，一整片大花瓣（按抖动的格子排，挨着的互相盖住）从画面左边扫进来、到 满 时整屏盖住（后面垫一块同色的底补缝），
//   然后底撤掉，花瓣从 散心（转场后那一镜要先露出来的地方）往外一圈圈吹走（风散开）。
// 时间都按歌上的秒（两段各自传自己的秒，转场前后接得上：同一个 秒 两边画的一模一样）。参数全是 Agent 暂定，见 樱花风参数.ts。
import React, { useLayoutEffect, useRef } from 'react';
import { rng } from '@engine/model/parts.tsx';
import { png, type Png } from '@engine/model/贴图.ts';
import { filmScale } from '@engine/三渲二/像素.ts';
import { type SakuraWindParams, type SakuraWindMoment, type WallPetal, sakuraWindDefaults, makeWindWall, wallPetalAt, windWallBottom } from './樱花风参数.ts';
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

const petalTextures: readonly Png[] = [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11].map((u) => png(u));

type Petal = { 生: number; 角: number; baseRadius: number; 档: number; 图: number; 转: number; flip: boolean; sideOffset: number; 速: number };

const makeWindFlow = (p: SakuraWindParams, t: SakuraWindMoment): Petal[] => {
  const r = rng(p.种子);
  const { 数: count, tiers } = p.windFlow;
  return Array.from({ length: count }, () => {
    // 越往后生得越密（u^0.6），后生的花瓣大（离镜头近）
    const u = r() ** 0.6;
    const birthSec = t.起 + (t.full - t.起) * u;
    const tier = tiers[Math.min(tiers.length - 1, Math.floor((u * 0.7 + r() * 0.3) * tiers.length))]!;
    return { 生: birthSec, 角: r() * Math.PI * 2, baseRadius: r() * 24, 档: tier, 图: Math.floor(r() * 12), 转: Math.floor(r() * 4), flip: r() < 0.5, sideOffset: r() * 2 - 1, 速: 0.7 + r() * 0.6 };
  });
};

const sakuraCache = new Map<string, { petals: Petal[]; wallPetals: WallPetal[] }>();

/** n×n 贴图（原版 3×3；材质包 32x 是 6×6）转 转×90°、翻了再左右翻以后，第 (i, j) 格取原图哪一格 */
const pickCell = (i: number, j: number, quarterTurns: number, flip: boolean, n = 3): [number, number] => {
  let [a, b] = [flip ? n - 1 - i : i, j];
  for (let k = 0; k < quarterTurns; k++) [a, b] = [n - 1 - b, a];
  return [a, b];
};

const drawPetal = (ctx: CanvasRenderingContext2D, petalImg: Png, x: number, y: number, tier: number, quarterTurns: number, flip: boolean) => {
  // 左上角吸到偶数成片像素（预览级一个画布像素是两个成片像素）
  const x0 = Math.round(x / 2) * 2;
  const y0 = Math.round(y / 2) * 2;
  // 档 是原版一个贴图像素的大小；材质包的高清贴图（n > 3）一格是它的 3/n，整片花瓣一样大
  const n = petalImg.w;
  const cellSize = (tier * 3) / n;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const [a, b] = pickCell(i, j, quarterTurns, flip, n);
      const k = (b * petalImg.w + a) * 4;
      if (petalImg.px[k + 3]! < 128) continue;
      ctx.fillStyle = `rgb(${petalImg.px[k]},${petalImg.px[k + 1]},${petalImg.px[k + 2]})`;
      ctx.fillRect(x0 + i * cellSize, y0 + j * cellSize, cellSize, cellSize);
    }
};

/** 风墙：满 之前整块从左往右扫进来（底跟着补缝），满 之后停住、底撤掉，花瓣从 心（成片像素）往外吹走 */
const paintWall = (ctx: CanvasRenderingContext2D, wallPetals: readonly WallPetal[], sec: number, windTime: SakuraWindMoment, p: SakuraWindParams, W: number, H: number, center: readonly [number, number]) => {
  const wallBottom = windWallBottom(sec, windTime, p, W);
  if (wallBottom) {
    ctx.fillStyle = p.windWall.底色;
    ctx.fillRect(Math.round(wallBottom[0] / 2) * 2, 0, Math.round((wallBottom[1] - wallBottom[0]) / 2) * 2, H);
  }
  for (const q of wallPetals) {
    const { x, y } = wallPetalAt(q, sec, windTime, p, W, H, center);
    const side = q.档 * 3;
    if (x < -side || x > W || y < -side || y > H) continue;
    drawPetal(ctx, petalTextures[q.图]!, x, y, q.档, q.转, q.flip);
  }
};

/**
 * 盖在画面上的樱花风。放在铺满画面、position 不是 static 的容器里。秒：歌上的秒；源：风起的地方（页面坐标，铃在画面上的位置），
 * 只影响风流；转场后的镜头里 源 照传摇铃那一镜的，花瓣接着上一镜的位置飞。
 * 散心：满 以后花瓣从这里往外吹散（页面坐标，默认画面中心），转场后那一镜要先看清的地方（第 15 句：推开的门里她的背影）
 */
export const SakuraWind: React.FC<{
  秒: number;
  windTime: SakuraWindMoment;
  源: { x: number; y: number };
  scatterCenter?: { x: number; y: number };
  参数?: SakuraWindParams;
  宽?: number;
  高?: number;
}> = ({ 秒: sec, windTime, 源: sourcePos, scatterCenter, 参数: p = sakuraWindDefaults, 宽: width = 1280, 高: height = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = width * filmScale;
  const H = height * filmScale;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (sec < windTime.起) return;
    const cacheKey = `${p.种子}|${windTime.起}|${windTime.full}|${width}x${height}`;
    let cacheEntry = sakuraCache.get(cacheKey);
    if (!cacheEntry) sakuraCache.set(cacheKey, (cacheEntry = { petals: makeWindFlow(p, windTime), wallPetals: makeWindWall(p, W, H) }));
    const f = p.windFlow;
    const afterFull = Math.max(0, sec - windTime.full);
    const center: [number, number] = scatterCenter ? [scatterCenter.x * filmScale, scatterCenter.y * filmScale] : [W / 2, H / 2];
    // 风流：从源往外打着旋卷，越老越往外、越往右上飘；满了以后从散心往四边加速吹散，散完秒 以后一片不留
    if (afterFull >= f.scatterDoneSec) return paintWall(ctx, cacheEntry.wallPetals, sec, windTime, p, W, H, center);
    for (const b of cacheEntry.petals) {
      if (sec < b.生) continue;
      const age = sec - b.生;
      const radius = (b.baseRadius + f.outwardCurl * b.速 * age ** 0.8) * filmScale;
      const angle = b.角 + Math.PI * 2 * f.rotSpeed * age * (b.sideOffset < 0 ? -1 : 1) * (0.6 + 0.4 * Math.abs(b.sideOffset));
      let x = sourcePos.x * filmScale + Math.cos(angle) * radius + f.driftRight * age * b.速 * filmScale;
      let y = sourcePos.y * filmScale + Math.sin(angle) * radius * f.spreadAmount * 2 - f.floatUp * age * filmScale;
      if (afterFull > 0) {
        const [dx, dy] = [x - center[0], y - center[1]];
        const d = Math.hypot(dx, dy) || 1;
        const pushForce = f.scatterAccel * b.速 * afterFull * afterFull * filmScale;
        x += (dx / d) * pushForce;
        y += (dy / d) * pushForce;
      }
      const side = b.档 * 3;
      if (x < -side || x > W || y < -side || y > H) continue;
      drawPetal(ctx, petalTextures[b.图]!, x, y, b.档, b.转, b.flip);
    }
    paintWall(ctx, cacheEntry.wallPetals, sec, windTime, p, W, H, center);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, imageRendering: 'pixelated' }} />;
};
