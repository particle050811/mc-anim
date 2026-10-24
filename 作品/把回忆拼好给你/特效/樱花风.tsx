// 樱花风（第 15 句：门口摇响寻风之铃，一阵樱花风从铃那里卷起来，卷到盖满画面就转场，到隐世之境门口散开）。2D，盖在镜头上面、整片后期里面。
// 花瓣照原版 cherry_leaves 粒子的 12 张 3×3 贴图（贴图/粒子/樱花/cherry_0～11），按贴图像素整数倍放大、只转 90° 的整数倍，
// 最近邻画在成片分辨率的画布上，和三渲二的像素一样硬（05-画风 原则 3）；原版粒子 0.1～0.15 格大、慢慢飘，这里是演绎：大、快、成团。
// 两种花瓣：
// - 风流：从 源（铃在画面上的位置）一路往外打着旋卷，越卷越大、越往右飘；
// - 风墙：盖满画面的那一层，一整片大花瓣（按抖动的格子排，挨着的互相盖住）从画面左边扫进来、到 满 时整屏盖住、再往右扫出去，后面垫一块同色的底补缝。
// 时间都按歌上的秒（两段各自传自己的秒，转场前后接得上：同一个 秒 两边画的一模一样）。参数全是 Agent 暂定，见 樱花风参数.ts。
import React, { useLayoutEffect, useRef } from 'react';
import { rng } from '@engine/model/parts.tsx';
import { png, type Png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { type 樱花风参数, type 樱花风时刻, 樱花风默认, 风墙沿 } from './樱花风参数.ts';
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

const 贴图们: readonly Png[] = [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11].map((u) => png(u));

type 瓣 = { 生: number; 角: number; 半径0: number; 档: number; 图: number; 转: number; 翻: boolean; 偏: number; 速: number };

const 造风流 = (p: 樱花风参数, t: 樱花风时刻): 瓣[] => {
  const r = rng(p.种子);
  const { 数, 档们 } = p.风流;
  return Array.from({ length: 数 }, () => {
    // 越往后生得越密（u^0.6），后生的花瓣大（离镜头近）
    const u = r() ** 0.6;
    const 生 = t.起 + (t.满 - t.起) * u;
    const 档 = 档们[Math.min(档们.length - 1, Math.floor((u * 0.7 + r() * 0.3) * 档们.length))]!;
    return { 生, 角: r() * Math.PI * 2, 半径0: r() * 24, 档, 图: Math.floor(r() * 12), 转: Math.floor(r() * 4), 翻: r() < 0.5, 偏: r() * 2 - 1, 速: 0.7 + r() * 0.6 };
  });
};

/** 风墙的花瓣：按 格距 排满一块比画面宽一倍的长方形（抖动半格），整块往右扫 */
const 造风墙 = (p: 樱花风参数, 宽: number, 高: number) => {
  const r = rng(p.种子 * 31 + 7);
  const { 格距, 档们 } = p.风墙;
  const out: { x: number; y: number; 档: number; 图: number; 转: number; 翻: boolean }[] = [];
  for (let y = -格距; y < 高 + 格距; y += 格距)
    for (let x = -格距; x < 宽 * 2 + 格距; x += 格距)
      out.push({ x: x + (r() - 0.5) * 格距 + p.风墙.波幅 * Math.sin((2 * Math.PI * y) / p.风墙.波长), y: y + (r() - 0.5) * 格距, 档: 档们[Math.floor(r() * 档们.length)]!, 图: Math.floor(r() * 12), 转: Math.floor(r() * 4), 翻: r() < 0.5 });
  return out;
};

const 缓存 = new Map<string, { 流: 瓣[]; 墙: ReturnType<typeof 造风墙> }>();

/** 3×3 贴图转 转×90°、翻了再左右翻以后，第 (i, j) 格取原图哪一格 */
const 取格 = (i: number, j: number, 转: number, 翻: boolean): [number, number] => {
  let [a, b] = [翻 ? 2 - i : i, j];
  for (let k = 0; k < 转; k++) [a, b] = [2 - b, a];
  return [a, b];
};

const 画瓣 = (ctx: CanvasRenderingContext2D, 图: Png, x: number, y: number, 档: number, 转: number, 翻: boolean) => {
  // 左上角吸到偶数成片像素（预览级一个画布像素是两个成片像素）
  const x0 = Math.round(x / 2) * 2;
  const y0 = Math.round(y / 2) * 2;
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      const [a, b] = 取格(i, j, 转, 翻);
      const k = (b * 图.w + a) * 4;
      if (图.px[k + 3]! < 128) continue;
      ctx.fillStyle = `rgb(${图.px[k]},${图.px[k + 1]},${图.px[k + 2]})`;
      ctx.fillRect(x0 + i * 档, y0 + j * 档, 档, 档);
    }
};

/** 风墙：整块从左往右扫，右沿在 满 前 扫过秒/2 进画，左沿在 满 后 扫过秒/2 出画；整屏盖住的那一小段正好以 满 为中心 */
const 画墙 = (ctx: CanvasRenderingContext2D, 墙: ReturnType<typeof 造风墙>, 秒: number, 时刻: 樱花风时刻, p: 樱花风参数, W: number, H: number) => {
  const { 右沿, 左沿 } = 风墙沿(秒, 时刻, p, W);
  if (右沿 <= 0 || 左沿 >= W) return;
  const 内缩 = p.风墙.格距 * 1.5 + p.风墙.波幅;
  ctx.fillStyle = p.风墙.底色;
  const a = Math.max(0, 左沿 + 内缩);
  const b = Math.min(W, 右沿 - 内缩);
  if (b > a) ctx.fillRect(Math.round(a / 2) * 2, 0, Math.round((b - a) / 2) * 2, H);
  for (const q of 墙) {
    const x = 左沿 + q.x;
    const 边 = q.档 * 3;
    if (x < -边 || x > W) continue;
    画瓣(ctx, 贴图们[q.图]!, x - 边 / 2, q.y - 边 / 2, q.档, q.转, q.翻);
  }
};

/**
 * 盖在画面上的樱花风。放在铺满画面、position 不是 static 的容器里。秒：歌上的秒；源：风起的地方（页面坐标，铃在画面上的位置），
 * 只影响风流；转场后的镜头里 源 照传摇铃那一镜的，花瓣接着上一镜的位置飞。
 */
export const 樱花风: React.FC<{ 秒: number; 时刻: 樱花风时刻; 源: { x: number; y: number }; 参数?: 樱花风参数; 宽?: number; 高?: number }> = ({
  秒,
  时刻,
  源,
  参数: p = 樱花风默认,
  宽 = 1280,
  高 = 720,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数;
  const H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (秒 < 时刻.起) return;
    const 键 = `${p.种子}|${时刻.起}|${时刻.满}|${宽}x${高}`;
    let 物 = 缓存.get(键);
    if (!物) 缓存.set(键, (物 = { 流: 造风流(p, 时刻), 墙: 造风墙(p, W, H) }));
    const f = p.风流;
    const 满后 = Math.max(0, 秒 - 时刻.满);
    // 风流：从源往外打着旋卷，越老越往外、越往右上飘；满了以后从画面中心往四边加速吹散，散完秒 以后一片不留
    if (满后 >= f.散完秒) return 画墙(ctx, 物.墙, 秒, 时刻, p, W, H);
    for (const b of 物.流) {
      if (秒 < b.生) continue;
      const 龄 = 秒 - b.生;
      const 半径 = (b.半径0 + f.外卷 * b.速 * 龄 ** 0.8) * 成片倍数;
      const 角 = b.角 + Math.PI * 2 * f.转速 * 龄 * (b.偏 < 0 ? -1 : 1) * (0.6 + 0.4 * Math.abs(b.偏));
      let x = 源.x * 成片倍数 + Math.cos(角) * 半径 + f.右飘 * 龄 * b.速 * 成片倍数;
      let y = 源.y * 成片倍数 + Math.sin(角) * 半径 * f.散开 * 2 - f.上飘 * 龄 * 成片倍数;
      if (满后 > 0) {
        const [dx, dy] = [x - W / 2, y - H / 2];
        const d = Math.hypot(dx, dy) || 1;
        const 推 = f.散加速 * b.速 * 满后 * 满后 * 成片倍数;
        x += (dx / d) * 推;
        y += (dy / d) * 推;
      }
      const 边 = b.档 * 3;
      if (x < -边 || x > W || y < -边 || y > H) continue;
      画瓣(ctx, 贴图们[b.图]!, x, y, b.档, b.转, b.翻);
    }
    画墙(ctx, 物.墙, 秒, 时刻, p, W, H);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, imageRendering: 'pixelated' }} />;
};
