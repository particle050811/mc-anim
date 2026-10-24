// 正片歌词艺术字：每个字由几枚附魔台符文（银河字母，这个字拼音的字母）从右边飞过来，一枚送来一块笔画，落定那一帧闪一下，唱到这个字时正好拼齐
// （用户 10-24：「每个字由几枚附魔台符文从旁边飞过来，拼出这个字的笔画，落定时闪一下」；分块和飞法见 符文拼字.ts）。
// 五个关键词另有效果（歌词字效.ts）；每句的位置、断行、对齐查 歌词排版表.ts（正片歌词行 带在 行.版 里）。
// 接口：行们（用 符文歌词数据.ts 的 正片歌词行 取）、样式（全片默认加这一镜的描边色）、收；帧 只给核对段钉帧用。
// 按「点」画：一个点 = 字点 个成片像素，点格从画面左上角数；每句一层，按成片分辨率整数倍放大、不抗锯齿。
// 进出场不用半透明，用 4×4 Bayer 抖动一个点一个点地亮、灭；描边 = 字和符文外一圈 8 邻域的点，1 点宽（歌词自己的字边，颜色给场的调子的 描边）。放在 整片后期 里面。
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import sgaPng from 'asset:贴图/界面/银河字母';
import glintPng from 'asset:贴图/特效/附魔光泽';
import 火花0 from 'asset:贴图/粒子/火花/0';
import 火花1 from 'asset:贴图/粒子/火花/1';
import 火花2 from 'asset:贴图/粒子/火花/2';
import 火花3 from 'asset:贴图/粒子/火花/3';
import 火花4 from 'asset:贴图/粒子/火花/4';
import 火花5 from 'asset:贴图/粒子/火花/5';
import 火花6 from 'asset:贴图/粒子/火花/6';
import 火花7 from 'asset:贴图/粒子/火花/7';
import raw from 'asset:字体/把回忆拼好给你/歌词字';
import { png, type Png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import type { 字形表 } from '@库/界面/像素字表.ts';
import { fps } from '../分镜.ts';
import { 光明, 光明圈数, 刹那, 刹那块, 放下, 放下块, 时差, 烟花, 烟花火花, 在词里 } from './歌词字效.ts';
import { 分块, 字种, 飞们, 飞位, type 块 } from './符文拼字.ts';
import { 做字源, 合样式, 字状态, 排一句, 解码时段, type 一字状态, type 摆字, type 符文歌词样式, type 符文歌词行 } from './符文排版.ts';

export { 符文歌词默认 } from './符文排版.ts';
export type { 符文歌词样式, 符文歌词行 };

const 源 = 做字源(png(sgaPng), raw as unknown as 字形表, '字体/把回忆拼好给你/歌词字');
const 火花贴图 = [火花0, 火花1, 火花2, 火花3, 火花4, 火花5, 火花6, 火花7];

const 拜耳 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4×4 Bayer 阈值（0～1 之间，不到 1）：显现度大于它的点才画 */
const 阈 = (X: number, Y: number) => (拜耳[(Y & 3) * 4 + (X & 3)]! + 0.5) / 16;

const 色缓存 = new Map<string, readonly [number, number, number]>();
const 色 = (s: string) => {
  let c = 色缓存.get(s);
  if (!c) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(s);
    if (!m) throw new Error(`符文歌词的颜色要写成 #RRGGBB，给的是 ${s}`);
    const n = parseInt(m[1]!, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    色缓存.set(s, c);
  }
  return c;
};
const 数色 = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;

type 点层 = {
  宽: number;
  高: number;
  /** RGBA */
  px: Uint8ClampedArray<ArrayBuffer>;
  /** 1 = 字或符文（描边绕着它描） */
  实: Uint8Array;
  /** 这一点吃多少附魔光泽（符文的点 1，汉字 0） */
  光: Float32Array;
};

const 新层 = (宽: number, 高: number): 点层 => ({ 宽, 高, px: new Uint8ClampedArray(宽 * 高 * 4), 实: new Uint8Array(宽 * 高), 光: new Float32Array(宽 * 高) });

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

/** 只画在空着的地方（不盖字、符文和描边），a = 不透明度：光圈、火花用 */
const 空点 = (层: 点层, X: number, Y: number, c: readonly number[], a = 1) => {
  if (X < 0 || Y < 0 || X >= 层.宽 || Y >= 层.高) return;
  const k = Y * 层.宽 + X;
  if (层.px[k * 4 + 3]) return;
  层.px[k * 4] = c[0]!;
  层.px[k * 4 + 1] = c[1]!;
  层.px[k * 4 + 2] = c[2]!;
  层.px[k * 4 + 3] = Math.round(255 * a);
};

// 附魔光泽（叠在符文上）：原版 RenderStateShard.setupGlintTexturing(8)：i = 毫秒 × 光泽速度(默认 0.5) × 8，贴图矩阵 = 平移(−(i%110000)/110000, (i%30000)/30000) · 绕 z 转 10° · 放大 8；
// 贴图双线性、重复铺；叠法 (SRC_COLOR, ONE)：底色 += (贴图 × 光泽强度(默认 0.75))²。物品图集里一格 16 像素约对上光泽贴图 16 像素，这里一个光泽像素 = 光泽像素点 个点
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

/** 一个字拼齐那一下，字形外框四个角外 2 点各闪一个亮点：第 1 帧十字（5 点），第 2 帧只剩中心一点 */
const 亮点 = (层: 点层, 格: 摆字, 解后: number, 可见: (X: number, Y: number) => boolean, rgb: readonly number[]) => {
  const 点们 = 源.汉字(格.字).点;
  const xs = 点们.map(([x]) => x);
  const ys = 点们.map(([, y]) => y);
  const 左 = Math.min(...xs) - 2;
  const 右 = Math.max(...xs) + 2;
  const 上 = Math.min(...ys) - 2;
  const 下 = Math.max(...ys) + 2;
  const 形 = 解后 < 1 ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
  for (const [cx, cy] of [[左, 上], [右, 上], [左, 下], [右, 下]] as const)
    for (const [dx, dy] of 形) {
      const X = 格.x + cx + dx!;
      const Y = 格.y + cy + dy!;
      if (可见(X, Y)) 点(层, X, Y, rgb);
    }
};

/** 一块落定后这一帧怎么画：挪几点、什么颜色（关键词效果改它），冰 = 刹那冻住的两档冰色 */
type 块样 = { dx: number; dy: number; 色: readonly number[]; 冰?: boolean };

type 一字 = { 格: 摆字; 音: string; 状: 一字状态; 时: { 起: number; 完: number }; 种: number; 块们: readonly 块[] };

/** 画一个字的符文和已经落定的块。块样 给关键词改落定以后的样子；调 = 时差的残影那一遍把所有颜色换成冷色 */
const 画字 = (层: 点层, 字: 一字, f: number, 样式: 符文歌词样式, 块样: (k: number) => 块样, 调?: (c: readonly number[]) => readonly number[]) => {
  const { 格, 音, 状, 时, 种, 块们 } = 字;
  const 符色 = 色(样式.符文色);
  const 飞 = 飞们(块们, 音, { ...时, 入: 状.入 }, 样式.飞帧, 种);
  const 画 = (X: number, Y: number, c: readonly number[], 光 = 0) => 点(层, X, Y, 调 ? 调(c) : c, 光);
  // 符文先画（落定的块盖在它上面：飞过还没拼好的邻字时不挡住字）
  飞.forEach((一, k) => {
    const 位 = 飞位(一, f);
    if (!位) return;
    const 留 = 1 - 状.出;
    const 现 = f - 一.起 < 1 ? 0.5 : 1;
    const 阵 = 源.符文(一.字母);
    const 心 = 块们[k]!.心;
    const x0 = Math.round(格.x + 心[0] + 位[0] - 阵.宽 / 2);
    const y0 = Math.round(格.y + 心[1] + 位[1] - 3.5);
    const c = 符色.map((v) => v * 一.亮);
    for (const [x, y] of 阵.点) {
      const X = x0 + x;
      const Y = y0 + y;
      if (留 * 现 > 阈(X, Y)) 画(X, Y, c, 1);
    }
  });
  // 落定那一帧：外面一圈闪圈色、笔画是闪色
  const 闪圈 = 色(样式.闪圈色);
  const 闪 = 色(样式.闪色);
  const 落着 = 飞.map((一) => f >= 一.落);
  飞.forEach((一, k) => {
    if (!落着[k] || f - 一.落 >= 1) return;
    const s = 块样(k);
    const 有 = new Set(块们[k]!.点.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of 块们[k]!.点)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (有.has(`${x + dx},${y + dy}`)) continue;
        const X = Math.round(格.x + x + dx + s.dx);
        const Y = Math.round(格.y + y + dy + s.dy);
        if (状.显 > 阈(X, Y)) 画(X, Y, 闪圈);
      }
  });
  飞.forEach((一, k) => {
    if (!落着[k]) return;
    const s = 块样(k);
    const 刚落 = f - 一.落 < 1;
    // 冰：笔画朝上露着的点亮一档（上面一点不是这个字的笔画）
    const 字点集 = s.冰 ? new Set(源.汉字(格.字).点.map(([x, y]) => `${x},${y}`)) : null;
    for (const [x, y] of 块们[k]!.点) {
      const X = Math.round(格.x + x + s.dx);
      const Y = Math.round(格.y + y + s.dy);
      if (!(状.显 > 阈(X, Y))) continue;
      const c = 刚落 ? 闪 : 字点集 ? (字点集.has(`${x},${y - 1}`) ? 色(刹那.冰色) : 色(刹那.冰亮色)) : s.色;
      画(X, Y, c);
    }
  });
  if (状.解后 >= 0 && 状.解后 < 样式.亮点帧) 亮点(层, 格, 状.解后, (X, Y) => 状.显 > 阈(X, Y), 调 ? 调(色(样式.字色)) : 色(样式.字色));
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

/** 把 影 垫在 层 底下：层 空着的点取 影 的点，不透明度乘 a（时差的残影） */
const 垫底 = (层: 点层, 影: 点层, a: number) => {
  for (let k = 0; k < 层.宽 * 层.高; k++) {
    if (层.px[k * 4 + 3] || !影.px[k * 4 + 3]) continue;
    for (let ch = 0; ch < 3; ch++) 层.px[k * 4 + ch] = 影.px[k * 4 + ch]!;
    层.px[k * 4 + 3] = Math.round(影.px[k * 4 + 3]! * a);
  }
};

/** 光明的光圈：到这个词笔画的曼哈顿距离一档一档亮（描边在时从描边外面起），只画在空处 */
const 光圈 = (层: 点层, 点们: readonly (readonly [number, number])[], 圈数: number, 有描边: boolean, 显: number) => {
  if (!圈数 || !点们.length) return;
  const 起 = 有描边 ? 2 : 1;
  const R = 起 + 圈数 - 1;
  const xs = 点们.map(([x]) => x);
  const ys = 点们.map(([, y]) => y);
  const x0 = Math.min(...xs) - R;
  const y0 = Math.min(...ys) - R;
  const w = Math.max(...xs) + R - x0 + 1;
  const h = Math.max(...ys) + R - y0 + 1;
  const 距 = new Int16Array(w * h).fill(9999);
  const 队: number[] = [];
  for (const [x, y] of 点们) {
    const k = (y - y0) * w + (x - x0);
    if (距[k] !== 0) {
      距[k] = 0;
      队.push(k);
    }
  }
  for (let q = 0; q < 队.length; q++) {
    const k = 队[q]!;
    const d = 距[k]!;
    if (d >= R) continue;
    const x = k % w;
    const y = Math.floor(k / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = ny * w + nx;
      if (距[nk]! <= d + 1) continue;
      距[nk] = d + 1;
      队.push(nk);
    }
  }
  const c = 色(光明.光色);
  for (let k = 0; k < w * h; k++) {
    const d = 距[k]!;
    if (d < 起 || d > R) continue;
    const X = x0 + (k % w);
    const Y = y0 + Math.floor(k / w);
    if (显 > 阈(X, Y)) 空点(层, X, Y, c, 光明.档们[d - 起]!);
  }
};

/** 烟花的火花：原版 spark 贴图（8×8，一个贴图像素 = 一个点）乘火花色，只画在空处、按 透 抖动 */
const 画火花 = (层: 点层, 心: readonly [number, number], 起圈: readonly [number, number], f: number, 齐: number, 种: number, 留: number) => {
  for (const s of 烟花火花(f, 齐, 种, 起圈)) {
    const tex: Png = png(火花贴图[s.档]!);
    const c = 数色(s.色);
    const x0 = Math.round(心[0] + s.x - tex.w / 2);
    const y0 = Math.round(心[1] + s.y - tex.h / 2);
    for (let y = 0; y < tex.h; y++)
      for (let x = 0; x < tex.w; x++) {
        const i = (y * tex.w + x) * 4;
        const a = tex.px[i + 3]! / 255;
        if (!a) continue;
        const X = x0 + x;
        const Y = y0 + y;
        if (!(s.透 * 留 * a > 阈(X, Y))) continue;
        空点(层, X, Y, [(tex.px[i]! * c[0]) / 255, (tex.px[i + 1]! * c[1]) / 255, (tex.px[i + 2]! * c[2]) / 255]);
      }
  }
};

/** 画一句到它自己的点层（字点按这句的样式），返回这一层；这一帧整句都看不见给 null */
const 画一句 = (行们: readonly 符文歌词行[], i: number, f: number, 底样式: 符文歌词样式, 宽: number, 高: number, 收?: number): { 层: 点层; 字点: number } | null => {
  const 行 = 行们[i]!;
  const 样式 = 合样式(底样式, 行.版);
  if (!Number.isInteger(样式.字点) || 样式.字点 <= 0) throw new Error(`符文歌词的字点要是正整数：${样式.字点}`);
  // 进场前（符文最早在进场那一帧起飞）、退场完都不画
  if (f < 行.入) return null;
  const 状们 = 字状态(行们, i, f, 样式, 收);
  if (状们.every((s) => s.出 >= 1)) return null;
  const 时段 = 解码时段(行, 样式);
  const 格们 = 排一句(源, 行.词, 样式, 宽, 高, 行.版).格们;
  const 字们: 一字[] = 格们.map((格, j) => ({ 格, 音: 行.拼音[j]!, 状: 状们[j]!, 时: 时段[j]!, 种: 字种(行.序 ?? 0, j), 块们: 分块(格.字, 源.汉字(格.字)) }));
  const 层 = 新层(Math.ceil(宽 / 样式.字点), Math.ceil(高 / 样式.字点));
  const 效 = 行.字效;
  const 齐 = 效 ? Math.max(...时段.slice(效.从, 效.到 + 1).map((d) => d.完)) : Infinity;
  const 字色 = 色(样式.字色);
  const 块样法 = (j: number) => (k: number): 块样 => {
    if (!效 || !在词里(效, j)) return { dx: 0, dy: 0, 色: 字色 };
    const 种 = 字们[j]!.种 * 8 + k;
    switch (效.效) {
      case '光明':
        return { dx: 0, dy: 0, 色: f >= 齐 ? 色(光明.字色) : 字色 };
      case '烟花':
        return { dx: 0, dy: 0, 色: f >= 齐 && f < 齐 + 烟花.染帧 ? 色(烟花.字色) : 字色 };
      case '刹那': {
        // 块的中心离整个词的中心多远（往哪边裂）
        const 词格 = 字们.slice(效.从, 效.到 + 1).map((z) => z.格);
        const 中x = (词格[0]!.x + 词格[词格.length - 1]!.x + 16) / 2;
        const 中y = 词格[0]!.y + 8;
        const 块 = 字们[j]!.块们[k]!;
        const r = 刹那块(f, 齐, 效.裂, [字们[j]!.格.x + 块.心[0] - 中x, 字们[j]!.格.y + 块.心[1] - 中y], 种);
        return { dx: r.dx, dy: r.dy, 色: 字色, 冰: r.冰 };
      }
      case '放下': {
        const r = 放下块(f, 齐, 种);
        return { dx: r.dx, dy: r.dy, 色: r.色 ? 色(放下.色们[r.色 - 1]!) : 字色 };
      }
      default:
        return { dx: 0, dy: 0, 色: 字色 };
    }
  };
  字们.forEach((z, j) => 画字(层, z, f, 样式, 块样法(j)));
  描边(层, 样式.描边色);
  上光泽(层, f);
  if (效) {
    const 词们 = 字们.slice(效.从, 效.到 + 1);
    const 留 = 1 - 状们[效.从]!.出;
    if (效.效 === '光明') {
      const 点们 = 词们.flatMap((z) => 源.汉字(z.格.字).点.map(([x, y]) => [z.格.x + x, z.格.y + y] as const));
      光圈(层, 点们, 光明圈数(f, 齐), !!样式.描边色, 状们[效.从]!.显);
    }
    if (效.效 === '烟花') {
      const 心: [number, number] = [(词们[0]!.格.x + 词们[词们.length - 1]!.格.x + 16) / 2, 词们[0]!.格.y + 8];
      画火花(层, 心, [(词们[词们.length - 1]!.格.x + 16 - 词们[0]!.格.x) / 2 + 1, 9], f, 齐, 字们[效.从]!.种, 留);
    }
    if (效.效 === '时差') {
      // 残影另画一层（晚半拍的拼字、错开、自己带描边），再垫到本体底下；颜色按原色的亮度染成冷色
      const 迟 = f - 效.半拍;
      const 迟状们 = 字状态(行们, i, 迟, 样式, 收);
      const 影 = 新层(层.宽, 层.高);
      const 冷 = 色(时差.色);
      const 调 = (c: readonly number[]) => {
        const 亮 = 0.5 + (0.5 * (c[0]! * 0.3 + c[1]! * 0.59 + c[2]! * 0.11)) / 255;
        return 冷.map((v) => v * 亮);
      };
      词们.forEach((z, n) => {
        const j = 效.从 + n;
        const 格 = { ...z.格, x: z.格.x + 时差.偏[0], y: z.格.y + 时差.偏[1] };
        画字(影, { ...z, 格, 状: { ...迟状们[j]!, 出: 状们[j]!.出, 显: 迟状们[j]!.显 * (1 - 状们[j]!.出) } }, 迟, 样式, () => ({ dx: 0, dy: 0, 色: 字色 }), 调);
      });
      描边(影, 样式.描边色);
      垫底(层, 影, 时差.透);
    }
  }
  return { 层, 字点: 样式.字点 };
};

/** 铺满画面，放在 position 不是 static 的容器里（如 AbsoluteFill）。行们按 入 从早到晚排 */
export const 符文歌词: React.FC<{ 行们: readonly 符文歌词行[]; 样式: 符文歌词样式; 收?: number; 帧?: number }> = ({ 行们, 样式, 收, 帧 }) => {
  const 当前 = useCurrentFrame();
  const f = 帧 ?? 当前;
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const 宽 = width * 成片倍数;
  const 高 = height * 成片倍数;
  for (let i = 1; i < 行们.length; i++) if (行们[i]!.入 < 行们[i - 1]!.入) throw new Error(`歌词「${行们[i]!.词}」的入帧比上一句早`);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    行们.forEach((_, i) => {
      const r = 画一句(行们, i, f, 样式, 宽, 高, 收);
      if (!r) return;
      const 小 = document.createElement('canvas');
      小.width = r.层.宽;
      小.height = r.层.高;
      小.getContext('2d')!.putImageData(new ImageData(r.层.px, r.层.宽, r.层.高), 0, 0);
      ctx.drawImage(小, 0, 0, r.层.宽 * r.字点, r.层.高 * r.字点);
    });
  });
  // 预览级（不放大）时画布按一半显示：最近邻缩，字点是奇数时点一格宽一格窄，但边是硬的
  return <canvas ref={ref} width={宽} height={高} style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none', imageRendering: 'pixelated' }} />;
};
