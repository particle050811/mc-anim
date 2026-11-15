// 樱花风（特效/樱花风.tsx）的参数、时间轴、风墙的花瓣和它们走到哪：纯模块，测试核转场前后整屏盖住、对视前散完用。参数全是 Agent 暂定。
import { filmScale } from '@engine/三渲二/像素.ts';

export type SakuraWindParams = {
  种子: number;
  /** 风流：花瓣数；一个贴图像素在成片上多大（从小到大几档，后生的取大的）；从 源 往外卷的速度（页面像素/秒）、转速（圈/秒）、往右、往上飘的速度、
   *  旋涡竖向压扁多少（散开）；满 以后从 散心（樱花风.tsx，默认画面中心）往四边吹散的加速度（页面像素/秒²），满 以后几秒全吹出画 */
  windFlow: { 数: number; tiers: readonly number[]; outwardCurl: number; rotSpeed: number; driftRight: number; floatUp: number; spreadAmount: number; scatterAccel: number; scatterDoneSec: number };
  /** 风墙：一个贴图像素在成片上多大（几档）、格距（成片像素）、前沿的波（每排花瓣按高度左右错开 波幅 × sin(2π·y / 波长)，前沿是一道弯的浪，不是一条竖线）、
   *  满 之前从左边扫进来用几秒（右沿进画到整屏盖住）、补缝的底色（sRGB，取花瓣的中间那档粉）；
   *  散：满 以后整块停住，补缝的底再留 底留秒，花瓣从 散心 往外一圈圈吹走（像推开的门里冲出一股风）：离散心 心半径（成片像素）以内的马上起步，
   *  再往外按离散心的远近晚起步，最远的（画面四角）晚 远迟秒，每片再随机晚 0～抖秒；起步后沿散心到花瓣中心那条线往外走，
   *  初速（成片像素/秒）、加速度（成片像素/秒²）都乘这片的 速（速们 之间） */
  windWall: {
    tiers: readonly number[];
    cellSpacing: number;
    waveAmplitude: number;
    wavelength: number;
    sweepInSec: number;
    底色: string;
    scatter: { baseHoldSec: number; centerRadius: number; farDelaySec: number; jitterSec: number; initSpeed: number; accel: number; speeds: readonly [number, number] };
  };
};

export const sakuraWindDefaults: SakuraWindParams = {
  种子: 1511,
  // 档们：门口那一镜是正交、N = 10（一个贴图像素成片 10 像素），风流里的花瓣算场景里的粒子，只取 N 和 2N 两档（核查 10-24：原来 10～40 四档，同屏好几种像素大小）
  windFlow: { 数: 700, tiers: [10, 10, 20, 20], outwardCurl: 650, rotSpeed: 1.2, driftRight: 900, floatUp: 350, spreadAmount: 0.3, scatterAccel: 12000, scatterDoneSec: 0.3 },
  windWall: {
    tiers: [40, 50, 60, 70],
    cellSpacing: 100,
    waveAmplitude: 260,
    wavelength: 1700,
    sweepInSec: 0.21,
    底色: '#eb9cc6',
    // 主会话 10-24：风散开那一下慢一点。核查 10-24：三稿 49.54「门被你推开，光灌进去，她背对着门」被花瓣挡着看不见（转场后 0.25 秒才散开，那时她已经在回头）。
    // 所以散心（推开的门、她的背影那块）先开：转场后 0.08 秒露出她，0.125 秒那一块干净（24 fps 时第 2、3 帧）；四边的花瓣晚起步、慢慢吹走，约 0.35 秒散完，对视那一帧（满 后 0.42 秒）之前一片不留
    scatter: { baseHoldSec: 0.03, centerRadius: 300, farDelaySec: 0.28, jitterSec: 0.04, initSpeed: 5000, accel: 40000, speeds: [0.8, 1.2] },
  },
};

/** 时间轴（歌上的秒）：起 = 摇铃（风从铃那里起），满 = 风墙整屏盖住（转场那一下） */
export type SakuraWindMoment = { 起: number; full: number };

/** 同 engine/model/parts.tsx 的 rng（mulberry32；那边是 tsx，纯模块不引） */
const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 风墙的一片花瓣：在整块里的位置（成片像素，左上角）、贴图像素多大、用哪张、转几个 90°、翻不翻；散的时候随机多晚起步（0～1，乘 抖秒）、速度乘多少 */
export type WallPetal = { x: number; y: number; 档: number; 图: number; 转: number; flip: boolean; jitter: number; 速: number };

/** 风墙的花瓣：按 格距 排满一块比画面宽一倍的长方形（抖动半格）。宽高是成片像素 */
export const makeWindWall = (p: SakuraWindParams, width: number, height: number): WallPetal[] => {
  const r = rng(p.种子 * 31 + 7);
  const scatterRand = rng(p.种子 * 31 + 11);
  const { cellSpacing, tiers, scatter } = p.windWall;
  const out: WallPetal[] = [];
  for (let y = -cellSpacing; y < height + cellSpacing; y += cellSpacing)
    for (let x = -cellSpacing; x < width * 2 + cellSpacing; x += cellSpacing)
      out.push({
        x: x + (r() - 0.5) * cellSpacing + p.windWall.waveAmplitude * Math.sin((2 * Math.PI * y) / p.windWall.wavelength),
        y: y + (r() - 0.5) * cellSpacing,
        档: tiers[Math.floor(r() * tiers.length)]!,
        图: Math.floor(r() * 12),
        转: Math.floor(r() * 4),
        flip: r() < 0.5,
        jitter: scatterRand(),
        速: scatter.speeds[0] + scatterRand() * (scatter.speeds[1] - scatter.speeds[0]),
      });
  return out;
};

/** 风墙（宽 2W 的一整块）在 秒 时的左右沿（成片像素）：右沿 0 进画，扫入秒 以后（满）整块停在左沿 −W/2、右沿 3W/2，盖满画面 */
export const windWallEdge = (sec: number, windTime: SakuraWindMoment, p: SakuraWindParams, W: number) => {
  const wallWidth = W * 2;
  const rightEdge = (Math.min(sec, windTime.full) - (windTime.full - p.windWall.sweepInSec)) * ((1.5 * W) / p.windWall.sweepInSec);
  return { rightEdge, leftEdge: rightEdge - wallWidth };
};

/** 散心（成片像素）离画面最远的那个角有多远 */
const farthest = (center: readonly [number, number], W: number, H: number) => Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([a, b]) => Math.hypot(a! - center[0], b! - center[1])));

/** 一片风墙花瓣在 秒 时的左上角（成片像素）：满 之前跟着整块走；满 之后按离 心（散心，成片像素，默认画面中心）的远近晚起步，
 *  沿散心到花瓣中心那条线往外吹走（见 樱花风参数 的 风墙.散） */
export const wallPetalAt = (q: WallPetal, sec: number, windTime: SakuraWindMoment, p: SakuraWindParams, W: number, H: number, center: readonly [number, number] = [W / 2, H / 2]) => {
  const { leftEdge } = windWallEdge(sec, windTime, p, W);
  const scatter = p.windWall.scatter;
  const side = q.档 * 3;
  const x = leftEdge + q.x;
  const [dx, dy] = [x + side / 2 - center[0], q.y + side / 2 - center[1]];
  const d = Math.hypot(dx, dy);
  const normDist = Math.min(1, Math.max(0, (d - scatter.centerRadius) / (farthest(center, W, H) - scatter.centerRadius)));
  const τ = sec - windTime.full - scatter.farDelaySec * normDist - scatter.jitterSec * q.jitter;
  if (τ <= 0) return { x, y: q.y };
  const [ux, uy] = d > 1 ? [dx / d, dy / d] : [1, 0];
  const travel = (scatter.initSpeed * τ + 0.5 * scatter.accel * τ * τ) * q.速;
  return { x: x + ux * travel, y: q.y + uy * travel };
};

/** 补缝的底（成片像素的 [左, 右)）：满 之前跟着整块走、两头各往里缩 1.5 格距加一个波幅；满 后再留 底留秒 就撤掉，花瓣之间露出底下的画面 */
export const windWallBottom = (sec: number, windTime: SakuraWindMoment, p: SakuraWindParams, W: number): [number, number] | null => {
  if (sec > windTime.full + p.windWall.scatter.baseHoldSec) return null;
  const { rightEdge, leftEdge } = windWallEdge(sec, windTime, p, W);
  const inset = p.windWall.cellSpacing * 1.5 + p.windWall.waveAmplitude;
  const a = Math.max(0, leftEdge + inset);
  const b = Math.min(W, rightEdge - inset);
  return b > a ? [a, b] : null;
};

/** 风墙在 秒 时是不是整屏盖住（补缝的底铺满整个画面宽）：测试核转场前后用 */
export const windWallCovered = (sec: number, windTime: SakuraWindMoment, p: SakuraWindParams = sakuraWindDefaults, width = 1280) => {
  const W = width * filmScale;
  const wallBottom = windWallBottom(sec, windTime, p, W);
  return wallBottom !== null && wallBottom[0] <= 0 && wallBottom[1] >= W;
};
