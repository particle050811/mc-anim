// 第 3 句祭坛召唤每一帧的状态：柱顶材料、化成的光、蛋糕盒、她、你、光、镜头。纯模块（测试也引），画法在 祭坛.tsx。
// 钟是歌曲帧 g（段内帧 + 段起帧，核对段直接给歌曲帧），时刻取 分镜.ts 的正片事件，分寸取 参数.ts。游戏里的刻 = 歌上的秒 × 20。
import { clamp01 } from '@engine/anim/anim.ts';
import { fps, 正片事件, 段窗口 } from '../../分镜.ts';
import * as 参 from './参数.ts';

type 点 = [number, number, number];

export const 段键 = '2-祭坛召唤';
/** 这一段在歌上的窗口：[起帧, 止帧) */
export const 窗口 = 段窗口(段键);
/** 各事件的歌曲帧 */
export const 事 = {
  点祭坛: 正片事件.第3句点祭坛.帧,
  拆一: 正片事件.第3句拆盒一.帧,
  拆二: 正片事件.第3句拆盒二.帧,
  拆三: 正片事件.第3句拆盒三.帧,
  光: 正片事件.第3句光.帧,
  递: 正片事件.第3句递蛋糕.帧,
  照片: 正片事件['照片-祭坛递蛋糕'].帧,
  推: 正片事件.第3句推眼睛.帧,
} as const;
/** 最后一帧（接第 4 句眼睛特写的那一帧） */
export const 末帧 = 窗口.止帧 - 1;

/** 歌曲帧 → 歌上的秒、游戏刻 */
export const 秒 = (g: number) => g / fps;
export const 刻 = (g: number) => (g / fps) * 20;

const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 插3 = (a: readonly number[], b: readonly number[], t: number): 点 => [插(a[0]!, b[0]!, t), 插(a[1]!, b[1]!, t), 插(a[2]!, b[2]!, t)];
const 缓 = (t: number) => t * t * (3 - 2 * t);

// ---------- 柱顶材料 ----------
/** 一样材料这一帧：物 = 浮在柱顶（中心位置、绕竖轴转角 度）；亮 = 刚合成那一下整个变白；光 = 化成的光点在往圈心飞（拖着两颗更小的） */
export type 浮物态 =
  | { 名: string; 样: '物' | '亮'; p: 点; 转: number }
  | { 名: string; 样: '光'; p: 点; 尾: 点[] };

/** 柱顶物品中心（显示变换之前的那一点）和转角：TileEntityAltarRenderer 的 毫秒 = (现在 + 方块坐标) mod 3600 */
export const 柱顶物位 = (m: (typeof 参.柱顶材料)[number], g: number): { p: 点; 转: number } => {
  const 周期 = 参.浮物.周期秒 * 1000;
  const 毫秒 = (((秒(g) * 1000 + m.相位 * 周期) % 周期) + 周期) % 周期;
  const z = 参.柱顶格高 + 参.浮物.高 + 参.浮物.浮幅 * Math.sin((毫秒 / (周期 / 2)) * Math.PI);
  return { p: [m.柱[0], m.柱[1], z], 转: 毫秒 / 10 };
};

/** 化光以后光点的位置：t 0～1，从柱顶飞到 汇点，越飞越快，中间往上拱一点 */
const 光点位 = (起: 点, t: number): 点 => {
  const k = clamp01(t) ** 2;
  const p = 插3(起, 参.化光.汇点, k);
  p[2] += 0.5 * Math.sin(Math.PI * clamp01(t));
  return p;
};

export const 浮物态们 = (g: number): 浮物态[] =>
  参.柱顶材料.flatMap((m): 浮物态[] => {
    const { p, 转 } = 柱顶物位(m, g);
    const k = g - 事.点祭坛;
    if (k < 0) return [{ 名: m.名, 样: '物', p, 转 }];
    if (k < 参.化光.亮帧) return [{ 名: m.名, 样: '亮', p, 转 }];
    const t = (k - 参.化光.亮帧 + 1) / 参.化光.飞帧;
    if (t > 1) return [];
    return [{ 名: m.名, 样: '光', p: 光点位(p, t), 尾: [光点位(p, t - 0.22), 光点位(p, t - 0.44)] }];
  });

// ---------- 蛋糕盒 ----------
/** 光点汇齐、盒子出来的那一帧 */
export const 盒生帧 = 事.点祭坛 + 参.化光.亮帧 + 参.化光.飞帧;
/** z：盒底高；盖：盖子还在；墙：四面墙往外倒的弧度（EntityBoxModel 的 xRot、zRot） */
export type 盒态 = { z: number; 盖: boolean; 墙: number };
export const 盒态 = (g: number): 盒态 | null => {
  if (g < 盒生帧 || g >= 事.拆三) return null;
  const 落 = clamp01((g - 盒生帧) / 参.盒.落帧);
  const 墙刻 = g >= 事.拆二 ? Math.min(刻(g) - 刻(事.拆二), 参.墙倒.最多刻) : 0;
  return { z: 参.盒.生高 * (1 - 落 * 落), 盖: g < 事.拆一, 墙: 墙刻 * 参.墙倒.每刻弧度 };
};
/** 盒子落地那一帧（落地扬一下灰） */
export const 盒落地帧 = 盒生帧 + 参.盒.落帧;

// ---------- 她 ----------
/** 抬：0 = 低着头，1 = 抬起来看着你的眼睛；笑：驯服以后 */
export type 她编排 = { 抬: number; 表情: '无' | '微笑' };
export const 她编排 = (g: number): 她编排 | null => {
  if (g < 事.拆三) return null;
  return { 抬: 缓(clamp01((g - 事.光) / 参.低头.抬头帧)), 表情: g >= 事.递 + 参.笑起帧 ? '微笑' : '无' };
};

// ---------- 你 ----------
/** 每一下右键（点祭坛、拆三下、递蛋糕）都挥一次手 */
export const 点击帧们 = [事.点祭坛, 事.拆一, 事.拆二, 事.拆三, 事.递] as const;
/** 原版 attackTime（0～1）：最近一次点击以后过了几刻 / 6；没在挥 = null */
export const 挥手进度 = (g: number): number | null => {
  const 近 = [...点击帧们].reverse().find((c) => c <= g);
  if (近 === undefined) return null;
  const t = (刻(g) - 刻(近)) / 参.挥手刻;
  return t < 1 ? t : null;
};
export const 换蛋糕帧 = 事.光 + Math.round(参.换蛋糕秒 * fps);
export const 蛋糕没帧 = 事.递 + Math.ceil((参.留蛋糕刻 / 20) * fps);
export type 手里 = '御币' | '蛋糕' | null;
export const 手里 = (g: number): 手里 => (g < 换蛋糕帧 ? '御币' : g < 蛋糕没帧 ? '蛋糕' : null);
/** 你一直看着圈心（盒子、她的脸）这一点 */
export const 你看 = [0, 0, 1.15] as 点;
/** 你的身子朝向（度，0 朝北、正 = 往左）：对着圈心 */
export const 你朝向 = (Math.atan2(-(参.她.脚[0] - 参.你.脚[0]), 参.她.脚[1] - 参.你.脚[1]) * 180) / Math.PI;
/** 你的眼睛（原版 1.62） */
export const 你眼: 点 = [参.你.脚[0], 参.你.脚[1], 参.你.脚[2] + 1.62];

// ---------- 光 ----------
/** 祭坛亮：这一帧亮着的几圈 [半径, 强度]（一档一档灭，最外圈先灭） */
export const 祭坛亮 = (g: number): [number, number][] => {
  const k = g - 事.点祭坛;
  const { 帧, 半径, 强 } = 参.光.祭坛亮;
  if (k < 0 || k >= 帧) return [];
  const 灭 = Math.max(0, Math.floor(((k - 帧 / 2) / (帧 / 2)) * 半径.length + 1));
  return 半径.map((r, i): [number, number] => [r, 强[i]!]).slice(Math.min(半径.length, 灭));
};
/** 光柱：这一帧的几层 [宽, 强度]（从 起前帧 前亮起，留 留帧 帧，再 退帧 帧里从外往里一层一层灭） */
export const 光柱 = (g: number): [number, number][] => {
  const { 宽, 强, 起前帧, 留帧, 退帧 } = 参.光.光柱;
  const k = g - (事.光 - 起前帧);
  if (k < 0) return [];
  const 退 = k - 起前帧 - 留帧;
  const 灭 = 退 < 0 ? 0 : Math.floor((退 / 退帧) * 宽.length) + 1;
  return 宽.map((w, i): [number, number] => [w, 强[i]!]).slice(0, Math.max(0, 宽.length - 灭));
};

// ---------- 镜头 ----------
export type 机 = { 眼: 点; 看: 点; 视角: number };
/** 最后一帧的机位：眼中 = 她两眼中点，朝 = 她看出去的方向（单位向量）；镜头在眼中前面 末距 格、看着眼中 */
export const 末机位 = (眼中: 点, 朝: 点): 机 => ({
  眼: [眼中[0] + 朝[0] * 参.镜头.末距, 眼中[1] + 朝[1] * 参.镜头.末距, 眼中[2] + 朝[2] * 参.镜头.末距],
  看: 眼中,
  视角: 参.镜头.视角,
});

const 减 = (a: readonly number[], b: readonly number[]): 点 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const 长 = (a: readonly number[]) => Math.hypot(a[0]!, a[1]!, a[2]!);
const 单位 = (a: readonly number[]): 点 => {
  const l = 长(a) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};

/** 抬完头的那一帧（镜头的「抬头」机位落在这里） */
export const 抬完帧 = 事.光 + 参.低头.抬头帧;

/** 镜头的关键机位：段首、第一下拆盒、第三下、抬完头、推眼睛、末帧（末帧要她的骨骼才算得出，由 末 给） */
export const 关键机位 = (末: 机): { 帧: number; 眼: 点; 看: 点 }[] => [
  { 帧: 窗口.起帧, ...参.镜头.起 },
  { 帧: 事.拆一, ...参.镜头.拆盒 },
  { 帧: 事.拆三, ...参.镜头.拆完 },
  { 帧: 抬完帧, ...参.镜头.抬头 },
  { 帧: 事.推, ...参.镜头.推起 },
  { 帧: 末帧, 眼: 末.眼, 看: 末.看 },
];

/** 三次埃尔米特：p0、p1 两头的值，m0、m1 两头每帧的变化率，h 这一段几帧，s 0～1 */
const 埃尔米特 = (p0: number, p1: number, m0: number, m1: number, h: number, s: number) => {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * h * m1;
};
/** 各关键点的变化率（每帧）：段首 = 第一段的平均速度（接切过来就在动），末帧 = 0（停稳），中间按两边的平均速度。
 *  保单调 = true 时中间取两边的加权调和平均（Fritsch–Carlson），两边同号时插出来不会冲过头，距离只减不增 */
const 变化率们 = (t: readonly number[], y: readonly number[], 保单调: boolean): number[] => {
  const n = t.length;
  const h = t.slice(1).map((v, i) => v - t[i]!);
  const d = h.map((hi, i) => (y[i + 1]! - y[i]!) / hi);
  return t.map((_, k) => {
    if (k === 0) return d[0]!;
    if (k === n - 1) return 0;
    const [a, b, ha, hb] = [d[k - 1]!, d[k]!, h[k - 1]!, h[k]!];
    if (!保单调) return (hb * a + ha * b) / (ha + hb);
    if (a * b <= 0) return 0;
    const w1 = 2 * hb + ha;
    const w2 = hb + 2 * ha;
    return (w1 + w2) / (w1 / a + w2 / b);
  });
};

/** 这一帧的镜头。末 = 末机位(…)（要她的骨骼才算得出，画的那边算好传进来）。
 *  眼睛：以她两眼中点（末.看）为心，离心距离取对数用保单调的三次插值（一路越推越近，推眼睛那一段越推越快、末帧停稳），
 *  方向用三次插值再归一；看点用三次插值。各段交界处速度连续，不会一帧里突然起速 */
export const 镜头态 = (g: number, 末: 机): 机 => {
  const 键 = 关键机位(末);
  const 心 = 末.看;
  const t = 键.map((k) => k.帧);
  const 距 = 键.map((k) => Math.log(长(减(k.眼, 心))));
  const 向 = 键.map((k) => 单位(减(k.眼, 心)));
  const 看 = 键.map((k) => k.看);
  const x = Math.min(Math.max(g, t[0]!), t[t.length - 1]!);
  const i = Math.min(t.findIndex((v, j) => j > 0 && x <= v) - 1, t.length - 2);
  const h = t[i + 1]! - t[i]!;
  const s = (x - t[i]!) / h;
  const 插值 = (ys: readonly number[], 保单调 = false) => {
    const m = 变化率们(t, ys, 保单调);
    return 埃尔米特(ys[i]!, ys[i + 1]!, m[i]!, m[i + 1]!, h, s);
  };
  const L = 插值(距, true);
  const u = 单位([0, 1, 2].map((c) => 插值(向.map((v) => v[c]!))));
  const r = Math.exp(L);
  return {
    眼: [心[0] + u[0] * r, 心[1] + u[1] * r, 心[2] + u[2] * r],
    看: [0, 1, 2].map((c) => 插值(看.map((v) => v[c]!))) as 点,
    视角: 参.镜头.视角,
  };
};
