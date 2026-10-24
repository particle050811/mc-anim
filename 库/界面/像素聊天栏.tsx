// 原版聊天栏（没打开聊天框时）的游戏像素字版：行为照 聊天栏.tsx（1.20.1 ChatComponent.render），字换成像素字表、带原版阴影，画在成片分辨率的画布上。
// 几何（界面像素）：界面高 = ceil(成片高 / 缩放)（Window 算界面尺寸向上取整），最新一行下沿在界面高 − 40，往上每行 9，最多 10 行；
//   底板 x 0～332，黑，不透明度 int(255 × 系数 × 0.5)；系统消息左边 x 0～2 一条 #D0D0D0；字从 x 4、行顶下 1 像素起，白色、原版阴影（往右下偏、颜色 × 0.25）。
// 寿命：系数 = clamp((1 − 年龄/200) × 10, 0, 1)²，字的不透明度 int(255 × 系数 × (1.0 × 0.9F + 0.1F))（聊天不透明度默认 1，float 相加后满亮是 254），
//   ≤ 3 整行不画。年龄按整刻。不折行：超过 320 宽直接报错（原版会折）。
import React, { useLayoutEffect, useRef } from 'react';
import type { ChatLine, ChatSpan } from './聊天栏.tsx';
import { 成片倍数, 行高, type 像素字体, type 字段 } from './像素字表.ts';

const 聊天宽 = 320;
const 最多行 = 10;
const 底边让出 = 40;
// ChatComponent：chatOpacity × (double)0.9F + (double)0.1F，默认 chatOpacity 1
const 聊天不透明 = Math.fround(0.9) + Math.fround(0.1);
const 底板不透明 = 0.5; // textBackgroundOpacity 默认
const 系统竖条色 = '#D0D0D0'; // GuiMessageTag.system()、systemSinglePlayer() 都是 13684944

/** 一行在第几刻（年龄）的不透明度，0～255 整数；null = 不画 */
export const 聊天行不透明度 = (年龄: number): { 字: number; 底: number } | null => {
  if (年龄 < 0 || 年龄 >= 200) return null;
  const k = Math.min(1, Math.max(0, (1 - 年龄 / 200) * 10)) ** 2;
  const 字 = Math.trunc(255 * k * 聊天不透明);
  if (字 <= 3) return null;
  return { 字, 底: Math.trunc(255 * k * 底板不透明) };
};

const 浮点分量 = (c: number) => Math.trunc(Math.fround(Math.fround(c / 255) * 255));
const 填 = (ctx: CanvasRenderingContext2D, 色: string, a: number, x0: number, y0: number, x1: number, y1: number, s: number, 原点y: number) => {
  const n = parseInt(色.slice(1), 16);
  ctx.fillStyle = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${浮点分量(a) / 255})`;
  ctx.fillRect(x0 * s, (y0 - 原点y) * s, (x1 - x0) * s, (y1 - y0) * s);
};

export type 像素聊天栏属性 = {
  /** 聊天行（同 聊天栏.tsx 的 ChatLine：起刻、颜色、几段字、系统） */
  lines: readonly ChatLine[];
  /** 当前时刻（刻，可带小数），和 ChatLine 的 起刻 同一个钟 */
  刻: number;
  /** GUI 缩放：一个界面像素占几个成片像素（2560×1440），正整数 */
  缩放: number;
  字体: 像素字体;
  /** 页面尺寸，默认 1280×720 */
  宽?: number;
  高?: number;
};

/** 放在铺满画面、position 不是 static 的容器里，自己贴左下角 */
export const 像素聊天栏: React.FC<像素聊天栏属性> = ({ lines, 刻, 缩放: s, 字体, 宽 = 1280, 高 = 720 }) => {
  if (!Number.isInteger(s) || s < 1) throw new Error(`像素聊天栏的缩放要是正整数（成片像素），给的是 ${s}`);
  const ref = useRef<HTMLCanvasElement>(null);
  const 界面高 = Math.ceil((高 * 成片倍数) / s);
  const 底行下沿 = 界面高 - 底边让出;
  // 画布盖住 10 行（往下多 1 像素给最底一行的阴影），横向到底板右沿
  const 顶 = 底行下沿 - 最多行 * 行高;
  const 画布宽 = Math.min(聊天宽 + 12, Math.ceil((宽 * 成片倍数) / s)) * s;
  const 画布高 = (最多行 * 行高 + 1) * s;
  const 已进 = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => line.起刻 <= 刻)
    .sort((a, b) => b.line.起刻 - a.line.起刻 || b.i - a.i)
    .slice(0, 最多行);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    已进.forEach(({ line }, 第几行) => {
      const a = 聊天行不透明度(Math.floor(刻) - Math.floor(line.起刻));
      if (!a) return;
      const 下 = 底行下沿 - 第几行 * 行高;
      const spans: readonly 字段[] = typeof line.text === 'string' ? [{ text: line.text }] : (line.text as readonly ChatSpan[]);
      const w = 字体.字宽(spans);
      if (w > 聊天宽) throw new Error(`聊天行「${spans.map((sp) => sp.text).join('')}」宽 ${w}，超过 ${聊天宽}：原版会折行，像素聊天栏还没做折行`);
      填(ctx, '#000000', a.底, 0, 下 - 行高, 聊天宽 + 12, 下, s, 顶);
      if (line.系统 !== false) 填(ctx, 系统竖条色, a.字, 0, 下 - 行高, 2, 下, s, 顶);
      字体.画(ctx, spans, { x: 0, y: 0 }, 4, 下 - 8 - 顶, line.color ?? '#FFFFFF', s, { 阴影: true, 不透明度: a.字 });
    });
  });
  return (
    <canvas
      ref={ref}
      width={画布宽}
      height={画布高}
      style={{ position: 'absolute', left: 0, top: (顶 * s) / 成片倍数, width: 画布宽 / 成片倍数, height: 画布高 / 成片倍数 }}
    />
  );
};
