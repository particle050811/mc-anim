// 樱花风（特效/樱花风.tsx）的参数、时间轴、风墙的花瓣和它们走到哪：纯模块，测试核转场那两帧整屏盖住、对视前散完用。参数全是 Agent 暂定。
import { 成片倍数 } from '@engine/三渲二/像素.ts';

export type 樱花风参数 = {
  种子: number;
  /** 风流：花瓣数；一个贴图像素在成片上多大（从小到大几档，后生的取大的）；从 源 往外卷的速度（页面像素/秒）、转速（圈/秒）、往右、往上飘的速度、
   *  旋涡竖向压扁多少（散开）；满 以后从画面中心往四边吹散的加速度（页面像素/秒²），满 以后几秒全吹出画（转场后的镜头先空出中间，推门那一下看得清） */
  风流: { 数: number; 档们: readonly number[]; 外卷: number; 转速: number; 右飘: number; 上飘: number; 散开: number; 散加速: number; 散完秒: number };
  /** 风墙：一个贴图像素在成片上多大（几档）、格距（成片像素）、前沿的波（每排花瓣按高度左右错开 波幅 × sin(2π·y / 波长)，前沿是一道弯的浪，不是一条竖线）、
   *  满 之前从左边扫进来用几秒（右沿进画到整屏盖住）、补缝的底色（sRGB，取花瓣的中间那档粉）；
   *  散：满 以后整块停住，补缝的底再留 底留秒，花瓣一片片从画面中心往外吹走——每片晚 0～迟秒 起步，加速度（成片像素/秒²）乘这片的 速（速们 之间） */
  风墙: {
    档们: readonly number[];
    格距: number;
    波幅: number;
    波长: number;
    扫入秒: number;
    底色: string;
    散: { 底留秒: number; 迟秒: number; 加速: number; 速们: readonly [number, number] };
  };
};

export const 樱花风默认: 樱花风参数 = {
  种子: 1511,
  风流: { 数: 700, 档们: [10, 10, 20, 20, 30, 40], 外卷: 650, 转速: 1.2, 右飘: 900, 上飘: 350, 散开: 0.3, 散加速: 12000, 散完秒: 0.3 },
  风墙: {
    档们: [40, 50, 60, 70],
    格距: 100,
    波幅: 260,
    波长: 1700,
    扫入秒: 0.21,
    底色: '#eb9cc6',
    // 主会话 10-24：风散开那一下慢一点。整片从中间往外一层层吹开，约 0.35 秒散完，对视那一帧（满 后 0.42 秒）之前一片不留
    散: { 底留秒: 0.03, 迟秒: 0.12, 加速: 70000, 速们: [0.8, 1.2] },
  },
};

/** 时间轴（歌上的秒）：起 = 摇铃（风从铃那里起），满 = 风墙整屏盖住（转场那一下） */
export type 樱花风时刻 = { 起: number; 满: number };

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

/** 风墙的一片花瓣：在整块里的位置（成片像素，左上角）、贴图像素多大、用哪张、转几个 90°、翻不翻；散的时候晚几秒起步、速度乘多少 */
export type 墙瓣 = { x: number; y: number; 档: number; 图: number; 转: number; 翻: boolean; 迟: number; 速: number };

/** 风墙的花瓣：按 格距 排满一块比画面宽一倍的长方形（抖动半格）。宽高是成片像素 */
export const 造风墙 = (p: 樱花风参数, 宽: number, 高: number): 墙瓣[] => {
  const r = rng(p.种子 * 31 + 7);
  const 散r = rng(p.种子 * 31 + 11);
  const { 格距, 档们, 散 } = p.风墙;
  const out: 墙瓣[] = [];
  for (let y = -格距; y < 高 + 格距; y += 格距)
    for (let x = -格距; x < 宽 * 2 + 格距; x += 格距)
      out.push({
        x: x + (r() - 0.5) * 格距 + p.风墙.波幅 * Math.sin((2 * Math.PI * y) / p.风墙.波长),
        y: y + (r() - 0.5) * 格距,
        档: 档们[Math.floor(r() * 档们.length)]!,
        图: Math.floor(r() * 12),
        转: Math.floor(r() * 4),
        翻: r() < 0.5,
        迟: 散r() * 散.迟秒,
        速: 散.速们[0] + 散r() * (散.速们[1] - 散.速们[0]),
      });
  return out;
};

/** 风墙（宽 2W 的一整块）在 秒 时的左右沿（成片像素）：右沿 0 进画，扫入秒 以后（满）整块停在左沿 −W/2、右沿 3W/2，盖满画面 */
export const 风墙沿 = (秒: number, 时刻: 樱花风时刻, p: 樱花风参数, W: number) => {
  const 墙宽 = W * 2;
  const 右沿 = (Math.min(秒, 时刻.满) - (时刻.满 - p.风墙.扫入秒)) * ((1.5 * W) / p.风墙.扫入秒);
  return { 右沿, 左沿: 右沿 - 墙宽 };
};

/** 一片风墙花瓣在 秒 时的左上角（成片像素）：满 之前跟着整块走；满 之后晚 迟 秒起步，沿画面中心到花瓣中心那条线往外加速吹走 */
export const 墙瓣在 = (q: 墙瓣, 秒: number, 时刻: 樱花风时刻, p: 樱花风参数, W: number, H: number) => {
  const { 左沿 } = 风墙沿(秒, 时刻, p, W);
  const 边 = q.档 * 3;
  const x = 左沿 + q.x;
  const τ = 秒 - 时刻.满 - q.迟;
  if (τ <= 0) return { x, y: q.y };
  const [dx, dy] = [x + 边 / 2 - W / 2, q.y + 边 / 2 - H / 2];
  const d = Math.hypot(dx, dy);
  const [ux, uy] = d > 1 ? [dx / d, dy / d] : [1, 0];
  const 走 = 0.5 * p.风墙.散.加速 * q.速 * τ * τ;
  return { x: x + ux * 走, y: q.y + uy * 走 };
};

/** 补缝的底（成片像素的 [左, 右)）：满 之前跟着整块走、两头各往里缩 1.5 格距加一个波幅；满 后再留 底留秒 就撤掉，花瓣之间露出底下的画面 */
export const 风墙底 = (秒: number, 时刻: 樱花风时刻, p: 樱花风参数, W: number): [number, number] | null => {
  if (秒 > 时刻.满 + p.风墙.散.底留秒) return null;
  const { 右沿, 左沿 } = 风墙沿(秒, 时刻, p, W);
  const 内缩 = p.风墙.格距 * 1.5 + p.风墙.波幅;
  const a = Math.max(0, 左沿 + 内缩);
  const b = Math.min(W, 右沿 - 内缩);
  return b > a ? [a, b] : null;
};

/** 风墙在 秒 时是不是整屏盖住（补缝的底铺满整个画面宽）：测试核转场那两帧用 */
export const 风墙盖满 = (秒: number, 时刻: 樱花风时刻, p: 樱花风参数 = 樱花风默认, 宽 = 1280) => {
  const W = 宽 * 成片倍数;
  const 底 = 风墙底(秒, 时刻, p, W);
  return 底 !== null && 底[0] <= 0 && 底[1] >= W;
};
