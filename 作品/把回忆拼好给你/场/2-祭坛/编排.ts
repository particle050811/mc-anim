// 第 3 句祭坛召唤每一帧的状态：柱顶材料、化成的光、她、你、光、两个镜头（远景贴地升起俯看祭坛，「光」那一拍切近景）。纯模块（测试也引），画法在 祭坛.tsx。
// 钟是歌曲帧 g（段内帧 + 段起帧，核对段直接给歌曲帧），时刻取 分镜.ts 的正片事件，分寸取 参数.ts，最后一帧取 末态.ts。游戏里的刻 = 歌上的秒 × 20。
import { clamp01 } from '@engine/anim/anim.ts';
import { fps, 正片事件, 段窗口 } from '../../分镜.ts';
import * as 参 from './参数.ts';
import { 末她, 末机, 末速, 眼珠 } from './末态.ts';

type 点 = [number, number, number];

export const 段键 = '2-祭坛召唤';
/** 这一段在歌上的窗口：[起帧, 止帧) */
export const 窗口 = 段窗口(段键);
/** 各事件的歌曲帧 */
export const 事 = {
  点祭坛: 正片事件.第3句点祭坛.帧,
  现身: 正片事件.第3句现身.帧,
  递: 正片事件.第3句递蛋糕.帧,
  照片: 正片事件['照片-祭坛递蛋糕'].帧,
  推: 正片事件.第3句推眼睛.帧,
  /** 切近景：「光」那一拍（光柱跨过这一刀接着亮） */
  切: 正片事件.第3句光.帧,
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

/** 化成光以后飞多少帧：从变白完到她现身那一帧汇齐 */
export const 飞帧 = 事.现身 - 事.点祭坛 - 参.化光.亮帧;

/** 化光以后光点的位置：t 0～1，从柱顶飞到 汇点，先慢后快（缓起），中间往上拱一点 */
const 光点位 = (起: 点, t: number): 点 => {
  const k = 缓(clamp01(t));
  const p = 插3(起, 参.化光.汇点, k);
  p[2] += 0.4 * Math.sin(Math.PI * clamp01(t));
  return p;
};

export const 浮物态们 = (g: number): 浮物态[] =>
  参.柱顶材料.flatMap((m): 浮物态[] => {
    const { p, 转 } = 柱顶物位(m, g);
    const k = g - 事.点祭坛;
    if (k < 0) return [{ 名: m.名, 样: '物', p, 转 }];
    if (k < 参.化光.亮帧) return [{ 名: m.名, 样: '亮', p, 转 }];
    const t = (k - 参.化光.亮帧 + 1) / 飞帧;
    if (t >= 1) return [];
    return [{ 名: m.名, 样: '光', p: 光点位(p, t), 尾: [光点位(p, t - 0.1), 光点位(p, t - 0.2)] }];
  });

// ---------- 她 ----------
/** 转：0 = 看着你，1 = 正对镜头（末她 的 看）；笑：驯服以后 */
export type 她编排 = { 转: number; 表情: '无' | '微笑' };
/** 转头那几帧的起点：推眼睛那一拍以后再等几帧（参数.ts 转头迟帧） */
export const 转头起帧 = 事.推 + 参.转头迟帧;
export const 她编排 = (g: number): 她编排 | null => {
  if (g < 事.现身) return null;
  return {
    转: 缓(clamp01((g - 转头起帧) / 参.转头帧)),
    表情: g >= 事.递 + 参.笑起帧 ? 末她.表情 : '无',
  };
};

// ---------- 你 ----------
/** 每一下右键（点祭坛、递蛋糕）都挥一次手。
 *  点祭坛是演绎（三稿「御币一点祭坛」）：TLM 1.5.3 的祭坛不认右键触发，放上最后一样材料那一下当刻自动合成；御币是拿来右键红羊毛搭祭坛的 */
export const 点击帧们 = [事.点祭坛, 事.递] as const;
/** 原版 attackTime（0～1）：最近一次点击以后过了几刻 / 6；没在挥 = null */
export const 挥手进度 = (g: number): number | null => {
  const 近 = [...点击帧们].reverse().find((c) => c <= g);
  if (近 === undefined) return null;
  const t = (刻(g) - 刻(近)) / 参.挥手刻;
  return t < 1 ? t : null;
};
export const 蛋糕没帧 = 事.递 + Math.ceil((参.留蛋糕刻 / 20) * fps);
export type 手里 = '御币' | '蛋糕' | null;
/** 远景里拿御币，切到近景时已经换成蛋糕（换东西在那一刀里，近景里不再单独换一次：核查 10-24 说近景一拍一件跟不上） */
export const 手里 = (g: number): 手里 => (g < 事.切 ? '御币' : g < 蛋糕没帧 ? '蛋糕' : null);
/** 你一直看着圈心（她的脸）这一点 */
export const 你看 = [0, 0, 1.15] as 点;
/** 你的身子朝向（度，0 朝北、正 = 往左）：对着圈心 */
export const 你朝向 = (Math.atan2(-(参.她.脚[0] - 参.你.脚[0]), 参.她.脚[1] - 参.你.脚[1]) * 180) / Math.PI;
/** 你的眼睛（原版 1.62） */
export const 你眼: 点 = [参.你.脚[0], 参.你.脚[1], 参.你.脚[2] + 1.62];

// ---------- 光 ----------
/** 祭坛亮：这一帧亮着的几圈 [半径, 强度]：点祭坛起三圈全亮，她现身以后 退帧 帧里一档一档灭（最外圈先灭） */
export const 祭坛亮 = (g: number): [number, number][] => {
  const { 半径, 强, 退帧 } = 参.光.祭坛亮;
  if (g < 事.点祭坛) return [];
  const 退 = g - 事.现身;
  const 灭 = 退 < 0 ? 0 : Math.floor((退 / 退帧) * 半径.length) + 1;
  return 半径.map((r, i): [number, number] => [r, 强[i]!]).slice(Math.min(半径.length, 灭));
};
/** 光柱：这一帧的几层 [宽, 强度]（她现身前 起前帧 亮起，留 留帧 帧，再 退帧 帧里从外往里一层一层灭） */
export const 光柱 = (g: number): [number, number][] => {
  const { 宽, 强, 起前帧, 留帧, 退帧 } = 参.光.光柱;
  const k = g - (事.现身 - 起前帧);
  if (k < 0) return [];
  const 退 = k - 起前帧 - 留帧;
  const 灭 = 退 < 0 ? 0 : Math.floor((退 / 退帧) * 宽.length) + 1;
  return 宽.map((w, i): [number, number] => [w, 强[i]!]).slice(0, Math.max(0, 宽.length - 灭));
};

// ---------- 镜头 ----------
export type 机 = { 眼: 点; 看: 点; 视角: number };

const 减 = (a: readonly number[], b: readonly number[]): 点 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const 长 = (a: readonly number[]) => Math.hypot(a[0]!, a[1]!, a[2]!);
const 单位 = (a: readonly number[]): 点 => {
  const l = 长(a) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};

/** 一个关键机位：歌曲帧、眼、看点、竖直视角 */
export type 关键 = { 帧: number; 眼: 点; 看: 点; 视角: number };
/** 近景的关键机位：光（切进来那一帧）、递蛋糕、推眼睛、末帧（末态.ts 的 末机） */
export const 关键机位 = (): 关键[] => {
  const { 近 } = 参.镜头;
  return [
    { 帧: 事.切, ...近.光 },
    { 帧: 事.递, ...近.递 },
    { 帧: 事.推, ...近.推 },
    { 帧: 末帧, 眼: 末机.眼, 看: 末机.看, 视角: 末机.视角 },
  ];
};

/** 三次埃尔米特：p0、p1 两头的值，m0、m1 两头每帧的变化率，h 这一段几帧，s 0～1 */
const 埃尔米特 = (p0: number, p1: number, m0: number, m1: number, h: number, s: number) => {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * h * m1;
};
/** 各关键点的变化率（每帧）：头一个 = 起率（不给 = 第一段的平均速度的一半，接切过来就在慢慢动），末帧 = 给定的（不给就停稳），中间按两边的平均速度。
 *  保单调 = true 时中间取两边的加权调和平均（Fritsch–Carlson），两边同号时插出来不会冲过头 */
const 变化率们 = (t: readonly number[], y: readonly number[], 保单调: boolean, 末率 = 0, 起率?: number): number[] => {
  const n = t.length;
  const h = t.slice(1).map((v, i) => v - t[i]!);
  const d = h.map((hi, i) => (y[i + 1]! - y[i]!) / hi);
  return t.map((_, k) => {
    if (k === 0) return 起率 ?? d[0]! / 2;
    if (k === n - 1) return 末率;
    const [a, b, ha, hb] = [d[k - 1]!, d[k]!, h[k - 1]!, h[k]!];
    if (!保单调) return (hb * a + ha * b) / (ha + hb);
    if (a * b <= 0) return 0;
    const w1 = 2 * hb + ha;
    const w2 = hb + 2 * ha;
    return (w1 + w2) / (w1 / a + w2 / b);
  });
};

/** 按近景的关键机位插这一帧的镜头。眼睛：以她右眼眼珠为心，离心距离取对数用保单调的三次插值，方向用三次插值再归一；
 *  看点用三次插值；视角保单调插。各关键机位两边速度连续，不会一帧里突然起速。
 *  末率：离心距离的对数在最后一个关键机位上每帧变多少（第 4 句接着这个速度推）；方向、看点、视角在最后一个关键机位停稳 */
const 插镜头 = (键: readonly 关键[], g: number, 末率: number): 机 => {
  const 心 = 眼珠.右;
  const t = 键.map((k) => k.帧);
  const 距 = 键.map((k) => Math.log(长(减(k.眼, 心))));
  const 向 = 键.map((k) => 单位(减(k.眼, 心)));
  const x = Math.min(Math.max(g, t[0]!), t[t.length - 1]!);
  const i = Math.min(t.findIndex((v, j) => j > 0 && x <= v) - 1, t.length - 2);
  const h = t[i + 1]! - t[i]!;
  const s = (x - t[i]!) / h;
  const 插值 = (ys: readonly number[], 保单调: boolean, 率: number) => {
    const m = 变化率们(t, ys, 保单调, 率);
    return 埃尔米特(ys[i]!, ys[i + 1]!, m[i]!, m[i + 1]!, h, s);
  };
  const r = Math.exp(插值(距, true, 末率));
  const u = 单位([0, 1, 2].map((c) => 插值(向.map((v) => v[c]!), false, 0)));
  return {
    眼: [心[0] + u[0] * r, 心[1] + u[1] * r, 心[2] + u[2] * r],
    看: [0, 1, 2].map((c) => 插值(键.map((k) => k.看[c]!), false, 0)) as 点,
    视角: 插值(键.map((k) => k.视角), true, 0),
  };
};

/** 远景一条轨在歌曲帧 g 的值：保单调三次插值，段首速度 0，最后一个关键帧接着最后一段的平均速度走（切走的时候还在动） */
const 远轨值 = (轨: 参.远轨, g: number): number => {
  const t = 轨.map(([f]) => (f === '切' ? 事.切 - 1 : 窗口.起帧 + f));
  const y = 轨.map(([, v]) => v);
  if (t.length === 1) return y[0]!;
  const n = t.length - 1;
  const x = Math.min(Math.max(g, t[0]!), t[n]!);
  const i = Math.min(t.findIndex((v, j) => j > 0 && x <= v) - 1, n - 1);
  const h = t[i + 1]! - t[i]!;
  const m = 变化率们(t, y, true, (y[n]! - y[n - 1]!) / (t[n]! - t[n - 1]!), 0);
  return 埃尔米特(y[i]!, y[i + 1]!, m[i]!, m[i + 1]!, h, (x - t[i]!) / h);
};

const 度 = Math.PI / 180;
/** 远景这一帧：贴着地面看着祭坛慢慢升高、往下俯，再慢慢往前飘（参数.ts 镜头.远） */
export const 远镜头 = (g: number): 机 => {
  const 远 = 参.镜头.远;
  const 眼: 点 = [远.x, 远轨值(远.y, g), 远轨值(远.z, g)];
  const 仰 = 远轨值(远.仰, g) * 度;
  const 偏 = 远轨值(远.偏, g) * 度;
  return { 眼, 看: [眼[0] + Math.sin(偏) * Math.cos(仰), 眼[1] + Math.cos(偏) * Math.cos(仰), 眼[2] + Math.sin(仰)], 视角: 远轨值(远.视角, g) };
};

/** 这一帧的镜头：「光」那一拍硬切，前面是远景（贴地升起、站在祭坛外头慢慢往前飘），后面是近景（在柱子圈里，她、你，一路推到她的右眼，
 *  末帧落在 末机、推的速度是 末速；方向、看点、视角在末帧停稳，第 4 句只接着推距离） */
export const 镜头态 = (g: number): 机 => (g < 事.切 ? 远镜头(g) : 插镜头(关键机位(), g, 末速));
