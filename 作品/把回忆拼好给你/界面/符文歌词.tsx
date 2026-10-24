// 正片歌词艺术字：每个字先写成它拼音的银河字母（附魔台那串咒语的字），唱到这个字时解码成汉字（10-22 提的方案，用户 10-24 要用上）。
// 接口照 界面/歌词.tsx：行们（多了拼音和逐字解码帧，用 符文歌词数据.ts 的 正片歌词行 取）、样式（场的 参数.ts 给）、收；帧 只给核对段钉帧用。
// 按「点」画（排法见 符文排版.ts）：一个点 = 样式.字点 个成片像素，点格从画面左上角数；画布按成片分辨率建，整数倍放大、不抗锯齿。
// 进出场不用半透明，用 4×4 Bayer 抖动一个点一个点地亮、灭（像素画里没有半透明的点）；描边 = 字外一圈 8 邻域的点，1 点宽，颜色给场的调子的 描边。
// 放在 整片后期 里面（和聊天栏、气泡一样吃调色和颗粒）。做法 A、B、C 是给用户挑的三种（Agent 暂定，比法见 核对/歌词艺术字）。
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import sgaPng from 'asset:贴图/界面/银河字母';
import glintPng from 'asset:贴图/特效/附魔光泽';
import raw from 'asset:字体/把回忆拼好给你/歌词字';
import { png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import type { 字形表 } from '@库/界面/像素字表.ts';
import { fps } from '../分镜.ts';
import { 做字源, 字状态, 字格, 排一句, 排拼音, 首字母符文, type 一字状态, type 排版样式, type 摆符文, type 时间样式, type 符文歌词行 } from './符文排版.ts';

export type { 符文歌词行 };

/**
 * A 符文拼字：拼音的银河字母按 1 点 = 符文 1 像素排在字格里（声母一行、韵母一行），唱到时符文的点散开、重新拼成汉字的点。
 * B 原版附魔字：只写拼音首字母一个符文，按游戏里 alt 字体和汉字同高的比例（符文 1 像素 = 2 点），带附魔光泽（原版物品光泽的贴图、走法、叠法）；
 *   唱到时抖动溶解成带光泽的紫色汉字，半秒里再抖成白字。
 * C 附魔台飞字：符文排法同 A，颜色照原版附魔台粒子（0.9k, 0.9k, k），一个个上下浮；唱到时照原版附魔粒子的轨迹（先往上、最后四次方落下）飞进字格中心，
 *   汉字从中心往外亮开。
 */
export type 符文歌词做法 = 'A' | 'B' | 'C';

export type 符文歌词样式 = 排版样式 &
  时间样式 & {
    做法: 符文歌词做法;
    字色: string;
    /** 符文的颜色（C 是粒子色的上限，再乘 0.9k, 0.9k, k） */
    符文色: string;
    /** null = 不描边 */
    描边色: string | null;
  };

const 共用 = { 位置: '上', 边距: 72, 字点: 6, 字色: '#ffffff', 描边色: '#24170f', 入帧: 3, 出帧: 3, 错开帧: 0.5 } as const;

/** 三种做法的默认样式（Agent 暂定）。字点 6 = 原版 /title 副标题在界面尺寸 6 下的大小（2 倍字），也正好是 N = 6 的一个贴图像素；
 *  描边色是 色板.ts 夏日白天 的，场里换成本场调子的 描边 */
export const 符文歌词默认: Readonly<Record<符文歌词做法, 符文歌词样式>> = {
  A: { ...共用, 做法: 'A', 符文色: '#c4b0ff', 解码帧: 5, 提前: 3 },
  B: { ...共用, 做法: 'B', 符文色: '#7458c8', 解码帧: 6, 提前: 3 },
  C: { ...共用, 做法: 'C', 符文色: '#ffffff', 解码帧: 8, 提前: 6 },
};

const 源 = 做字源(png(sgaPng), raw as unknown as 字形表, '字体/把回忆拼好给你/歌词字');

const 拜耳 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4×4 Bayer 阈值（0～1 之间，不到 1）：显现度大于它的点才画 */
const 阈 = (X: number, Y: number) => (拜耳[(Y & 3) * 4 + (X & 3)]! + 0.5) / 16;

/** 定死的散列（不用 Math.random：同一帧每次渲都一样），返回 [0, 1) */
const 散 = (a: number, b: number, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const 平滑 = (q: number) => q * q * (3 - 2 * q);

const 色 = (s: string): [number, number, number] => {
  const m = /^#([0-9a-fA-F]{6})$/.exec(s);
  if (!m) throw new Error(`符文歌词的颜色要写成 #RRGGBB，给的是 ${s}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

type 点层 = {
  宽: number;
  高: number;
  /** RGBA */
  px: Uint8ClampedArray<ArrayBuffer>;
  /** 1 = 字（描边绕着它描） */
  实: Uint8Array;
  /** 这一点吃多少附魔光泽（B） */
  光: Float32Array;
};

const 点 = (层: 点层, X: number, Y: number, c: readonly number[], 光 = 0) => {
  if (X < 0 || Y < 0 || X >= 层.宽 || Y >= 层.高) return;
  const k = Y * 层.宽 + X;
  层.px[k * 4] = c[0]!;
  层.px[k * 4 + 1] = c[1]!;
  层.px[k * 4 + 2] = c[2]!;
  层.px[k * 4 + 3] = 255;
  层.实[k] = 1;
  层.光[k] = 光;
};

const 字码 = (字: string) => 字.codePointAt(0)!;

/** A 的拼字粒子：每个汉字点从离它最近的符文点出发；没被哪个汉字点挑中的符文点飞到离它最近的汉字点上（起点合起来正好是符文，终点正好是汉字） */
type 粒子 = { 从: readonly [number, number]; 到: readonly [number, number]; 迟: number };
const 拼字缓存 = new Map<string, 粒子[]>();
const 拼字粒子 = (字: string, 音: string): 粒子[] => {
  const 键 = `${字}${音}`;
  const 有 = 拼字缓存.get(键);
  if (有) return 有;
  const 符点 = 排拼音(源, 音).flatMap((r) => r.点阵.点.map(([x, y]) => [r.x + x, r.y + y] as const));
  const 汉点 = 源.汉字(字).点;
  const c = 字码(字);
  // 距离一样时按散列挑，免得一排点都挤向同一个
  const 最近 = (p: readonly [number, number], 们: readonly (readonly [number, number])[], 种: number) => {
    let best = 0;
    let bd = Infinity;
    们.forEach((q, i) => {
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + 散(种, i) * 0.5;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const 用过 = new Set<number>();
  const out: 粒子[] = [];
  汉点.forEach((g, i) => {
    const s = 最近(g, 符点, c * 977 + i);
    用过.add(s);
    out.push({ 从: 符点[s]!, 到: g, 迟: 散(c, i, 1) * 0.4 });
  });
  符点.forEach((s, i) => {
    if (!用过.has(i)) out.push({ 从: s, 到: 汉点[最近(s, 汉点, c * 131 + i)]!, 迟: 散(c, i, 2) * 0.4 });
  });
  拼字缓存.set(键, out);
  return out;
};

// 附魔光泽（B）：原版 RenderStateShard.setupGlintTexturing(8)：i = 毫秒 × 光泽速度(默认 0.5) × 8，贴图矩阵 = 平移(−(i%110000)/110000, (i%30000)/30000) · 绕 z 转 10° · 放大 8；
// 贴图双线性、重复铺；叠法 (SRC_COLOR, ONE)：底色 += (贴图 × 光泽强度(默认 0.75))²。物品图集里一格 16 像素约对上光泽贴图 16 像素，这里一个光泽像素 = 符文 1 像素 = 2 点
const 光泽速度 = 0.5;
const 光泽强度 = 0.75;
const 光泽像素点 = 2;
const 转 = (10 * Math.PI) / 180;
const 光泽 = (X: number, Y: number, 毫秒: number, out: number[]) => {
  const tex = png(glintPng);
  const i = 毫秒 * 光泽速度 * 8;
  const a = X / 光泽像素点 / 128;
  const b = Y / 光泽像素点 / 128;
  const u = (Math.cos(转) * a - Math.sin(转) * b - (i % 110000) / 110000) * tex.w - 0.5;
  const v = (Math.sin(转) * a + Math.cos(转) * b + (i % 30000) / 30000) * tex.h - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const 取 = (x: number, y: number, ch: number) => tex.px[((((y % tex.h) + tex.h) % tex.h) * tex.w + (((x % tex.w) + tex.w) % tex.w)) * 4 + ch]!;
  for (let ch = 0; ch < 3; ch++) {
    const s = (取(x0, y0, ch) * (1 - fx) + 取(x0 + 1, y0, ch) * fx) * (1 - fy) + (取(x0, y0 + 1, ch) * (1 - fx) + 取(x0 + 1, y0 + 1, ch) * fx) * fy;
    out[ch] = ((光泽强度 * s) / 255) ** 2 * 255;
  }
};

/** 解完的汉字带着光泽留几帧，再抖成字色（演绎） */
const 光泽留帧 = 12;
/** C：飞的时候先往格子中心上方几点去，最后四次方落进中心（原版 EnchantmentTableParticle 的 −(1−f)⁴ × 1.2 格） */
const 飞落 = 6;

const 画一字 = (层: 点层, 格: { 字: string; x: number; y: number }, 音: string, 状: 一字状态, 样式: 符文歌词样式, f: number) => {
  const { 显, 解 } = 状;
  if (显 <= 0) return;
  const 字色 = 色(样式.字色);
  const 符色 = 色(样式.符文色);
  const 可见 = (X: number, Y: number) => 显 > 阈(X, Y);
  const c = 字码(格.字);
  /** 画汉字的点：筛 按字格里的坐标（x, y）或画面点格（X, Y）挑 */
  const 画汉字 = (筛: (x: number, y: number, X: number, Y: number) => boolean = () => true, 光 = 0) => {
    for (const [x, y] of 源.汉字(格.字).点) {
      const X = 格.x + x;
      const Y = 格.y + y;
      if (可见(X, Y) && 筛(x, y, X, Y)) 点(层, X, Y, 字色, 光);
    }
  };
  /** 画一个符文：左上角在字格里 (x, y)，一像素 尺 点 */
  const 画符文 = (r: 摆符文, x: number, y: number, 尺: number, rgb: readonly number[], 光 = 0, 筛: (X: number, Y: number) => boolean = () => true) => {
    for (const [px, py] of r.点阵.点)
      for (let dy = 0; dy < 尺; dy++)
        for (let dx = 0; dx < 尺; dx++) {
          const X = 格.x + x + px * 尺 + dx;
          const Y = 格.y + y + py * 尺 + dy;
          if (可见(X, Y) && 筛(X, Y)) 点(层, X, Y, rgb, 光);
        }
  };

  if (样式.做法 === 'A') {
    if (解 <= 0) {
      for (const r of 排拼音(源, 音)) 画符文(r, r.x, r.y, 1, 符色);
      return;
    }
    if (解 >= 1) return 画汉字();
    for (const p of 拼字粒子(格.字, 音)) {
      const q = clamp01((解 - p.迟) / 0.6);
      const e = 平滑(q);
      const X = 格.x + Math.round(p.从[0] + (p.到[0] - p.从[0]) * e);
      const Y = 格.y + Math.round(p.从[1] + (p.到[1] - p.从[1]) * e);
      if (可见(X, Y)) 点(层, X, Y, q < 0.5 ? 符色 : 字色);
    }
    return;
  }

  if (样式.做法 === 'B') {
    // 溶解：每一点的阈值定死（换一种 Bayer 相位，和进场的抖动错开），解过了它的阈值这一点就从符文换成汉字
    const 溶 = (X: number, Y: number) => 阈(X + 1, Y + 2);
    if (解 < 1) {
      const r = 首字母符文(源, 音);
      画符文(r, r.x, r.y, 2, 符色, 1, (X, Y) => 解 <= 溶(X, Y));
    }
    if (解 <= 0) return;
    // 刚解出来的汉字先是符文那种带光泽的紫，光泽留帧 帧里再一点点抖成字色（白字上叠光泽看不出来，所以让字先「带着附魔」）
    const 冷 = clamp01(状.解后 / 光泽留帧);
    for (const [x, y] of 源.汉字(格.字).点) {
      const X = 格.x + x;
      const Y = 格.y + y;
      if (!可见(X, Y) || 解 <= 溶(X, Y)) continue;
      if (冷 > 阈(X + 2, Y + 1)) 点(层, X, Y, 字色);
      else 点(层, X, Y, 符色, 1);
    }
    return;
  }

  // C：符文一个个是粒子，各自的亮度 k、浮动相位、出发先后按字和第几个符文散列定死
  const 心 = 字格 / 2 - 0.5;
  if (解 < 1)
    排拼音(源, 音).forEach((r, k) => {
      const 亮 = 0.7 + 0.3 * 散(c, k, 3);
      const rgb = [符色[0] * 0.9 * 亮, 符色[1] * 0.9 * 亮, 符色[2] * 亮];
      const 浮 = Math.round(Math.sin(2 * Math.PI * ((f / fps) * 0.7 + 散(c, k, 4))));
      const 半宽 = r.点阵.宽 / 2;
      const 半高 = r.点阵.高 / 2;
      let x = r.x;
      let y = r.y + 浮;
      if (解 > 0) {
        const q = clamp01((解 - 0.3 * 散(c, k, 5)) / 0.55);
        if (q >= 1) return;
        // 原版：x = 终 + 差 × g，y = 终 + 差 × g − (1 − g)⁴ × 1.2，g 从 1 走到 0；这里的「终」是格子中心上方 飞落 点
        const g = 1 - q;
        const 终y = 心 - 飞落;
        x = Math.round(心 + (x + 半宽 - 心) * g - 半宽);
        y = Math.round(终y + (y + 半高 - 终y) * g + 飞落 * (1 - g) ** 4 - 半高);
      }
      画符文(r, x, y, 1, rgb);
    });
  if (解 >= 1) return 画汉字();
  // 汉字从中心往外亮开，外沿一圈 8 个亮点
  const 半径 = 12 * clamp01((解 - 0.45) / 0.45);
  if (半径 <= 0) return;
  画汉字((x, y) => (x - 心) ** 2 + (y - 心) ** 2 <= 半径 ** 2);
  for (let m = 0; m < 8; m++) {
    const a = (m * Math.PI) / 4 + 散(c, 0, 6) * Math.PI;
    const X = 格.x + Math.round(心 + Math.cos(a) * (半径 + 1));
    const Y = 格.y + Math.round(心 + Math.sin(a) * (半径 + 1));
    if (可见(X, Y)) 点(层, X, Y, 字色);
  }
};

const 描边 = (层: 点层, 描边色: string | null) => {
  if (!描边色) return;
  const c = 色(描边色);
  const { 宽, 高, 实 } = 层;
  for (let Y = 0; Y < 高; Y++)
    for (let X = 0; X < 宽; X++) {
      if (实[Y * 宽 + X]) continue;
      let 挨 = false;
      for (let dy = -1; dy <= 1 && !挨; dy++)
        for (let dx = -1; dx <= 1 && !挨; dx++) {
          const x = X + dx;
          const y = Y + dy;
          挨 = x >= 0 && y >= 0 && x < 宽 && y < 高 && 实[y * 宽 + x] === 1;
        }
      if (!挨) continue;
      const k = Y * 宽 + X;
      层.px[k * 4] = c[0];
      层.px[k * 4 + 1] = c[1];
      层.px[k * 4 + 2] = c[2];
      层.px[k * 4 + 3] = 255;
    }
};

const 上光泽 = (层: 点层, f: number) => {
  const 毫秒 = (f / fps) * 1000;
  const g = [0, 0, 0];
  for (let k = 0; k < 层.宽 * 层.高; k++) {
    const s = 层.光[k]!;
    if (!s || !层.实[k]) continue;
    光泽(k % 层.宽, Math.floor(k / 层.宽), 毫秒, g);
    for (let ch = 0; ch < 3; ch++) 层.px[k * 4 + ch] = 层.px[k * 4 + ch]! + s * g[ch]!;
  }
};

/** 铺满画面，放在 position 不是 static 的容器里（如 AbsoluteFill）。行们按 入 从早到晚排 */
export const 符文歌词: React.FC<{ 行们: readonly 符文歌词行[]; 样式: 符文歌词样式; 收?: number; 帧?: number }> = ({ 行们, 样式, 收, 帧 }) => {
  const 当前 = useCurrentFrame();
  const f = 帧 ?? 当前;
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const 宽 = width * 成片倍数;
  const 高 = height * 成片倍数;
  if (!Number.isInteger(样式.字点) || 样式.字点 <= 0 || 样式.字点 % 2) throw new Error(`符文歌词的字点要是正偶数：${样式.字点}`);
  for (let i = 1; i < 行们.length; i++) if (行们[i]!.入 < 行们[i - 1]!.入) throw new Error(`歌词「${行们[i]!.词}」的入帧比上一句早`);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const 点宽 = Math.ceil(宽 / 样式.字点);
    const 点高 = Math.ceil(高 / 样式.字点);
    const 层: 点层 = { 宽: 点宽, 高: 点高, px: new Uint8ClampedArray(点宽 * 点高 * 4), 实: new Uint8Array(点宽 * 点高), 光: new Float32Array(点宽 * 点高) };
    行们.forEach((行, i) => {
      const 状们 = 字状态(行们, i, f, 样式, 收);
      if (!状们.some((s) => s.显 > 0)) return;
      排一句(源, 行.词, 样式, 宽, 高).格们.forEach((格, j) => 画一字(层, 格, 行.拼音[j]!, 状们[j]!, 样式, f));
    });
    描边(层, 样式.描边色);
    if (样式.做法 === 'B') 上光泽(层, f);
    const 小 = document.createElement('canvas');
    小.width = 点宽;
    小.height = 点高;
    小.getContext('2d')!.putImageData(new ImageData(层.px, 点宽, 点高), 0, 0);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(小, 0, 0, 点宽 * 样式.字点, 点高 * 样式.字点);
  });
  return <canvas ref={ref} width={宽} height={高} style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none' }} />;
};
