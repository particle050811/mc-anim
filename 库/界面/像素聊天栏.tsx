// 原版聊天栏（没打开聊天框时）的游戏像素字版：行为照 聊天栏.tsx（1.20.1 ChatComponent.render），字换成像素字表、带原版阴影，画在成片分辨率的画布上。
// 几何（界面像素）：界面高 = ceil(成片高 / 缩放)（Window 算界面尺寸向上取整），最新一行下沿在界面高 − 40，往上每行 9，最多 10 行；
//   底板 x 0～聊天宽 + 12（聊天宽默认 320；原版设置「聊天栏宽度」可调，见 原版聊天宽），黑，不透明度 int(255 × 系数 × 0.5)；系统消息左边 x 0～2 一条 #D0D0D0；字从 x 4、行顶下 1 像素起，白色、原版阴影（往右下偏、颜色 × 0.25）。
// 寿命：系数 = clamp((1 − 年龄/200) × 10, 0, 1)²，字的不透明度 int(255 × 系数 × (1.0 × 0.9F + 0.1F))（聊天不透明度默认 1，float 相加后满亮是 254），
//   ≤ 3 整行不画。年龄按整刻。不折行：超过聊天宽直接报错（原版会折）。
import React, { useLayoutEffect, useRef } from 'react';
import type { ChatLine, ChatSpan } from './聊天栏.tsx';
import { filmScale, lineHeight, type PixelFont, type TextRun } from './像素字表.ts';

/** 原版设置「聊天栏宽度」（0～1）对应的聊天宽（界面像素）：ChatComponent.getWidth = floor(设置 × 280 + 40)，默认 1 → 320 */
export const vanillaChatWidth = (setting: number) => Math.floor(setting * 280 + 40);
const maxLines = 10;
const bottomGap = 40;
// ChatComponent：chatOpacity × (double)0.9F + (double)0.1F，默认 chatOpacity 1
const chatOpacity = Math.fround(0.9) + Math.fround(0.1);
const panelOpacity = 0.5; // textBackgroundOpacity 默认
const systemBarColor = '#D0D0D0'; // GuiMessageTag.system()、systemSinglePlayer() 都是 13684944

/** 一行在第几刻（年龄）的不透明度，0～255 整数；null = 不画 */
export const chatLineOpacity = (age: number): { char: number; bottomAlpha: number } | null => {
  if (age < 0 || age >= 200) return null;
  const k = Math.min(1, Math.max(0, (1 - age / 200) * 10)) ** 2;
  const textAlpha = Math.trunc(255 * k * chatOpacity);
  if (textAlpha <= 3) return null;
  return { char: textAlpha, bottomAlpha: Math.trunc(255 * k * panelOpacity) };
};

const floatComponent = (c: number) => Math.trunc(Math.fround(Math.fround(c / 255) * 255));
const fillBox = (ctx: CanvasRenderingContext2D, color: string, a: number, x0: number, y0: number, x1: number, y1: number, s: number, originY: number) => {
  const n = parseInt(color.slice(1), 16);
  ctx.fillStyle = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${floatComponent(a) / 255})`;
  ctx.fillRect(x0 * s, (y0 - originY) * s, (x1 - x0) * s, (y1 - y0) * s);
};

export type PixelChatBarProps = {
  /** 聊天行（同 聊天栏.tsx 的 ChatLine：起刻、颜色、几段字、系统） */
  lines: readonly ChatLine[];
  /** 当前时刻（刻，可带小数），和 ChatLine 的 起刻 同一个钟 */
  刻: number;
  /** GUI 缩放：一个界面像素占几个成片像素（2560×1440），正整数 */
  scale: number;
  字体: PixelFont;
  /** 页面尺寸，默认 1280×720 */
  width?: number;
  height?: number;
  /** 聊天宽（界面像素），默认 320（原版设置「聊天栏宽度」100%）；别的设置用 原版聊天宽 换算 */
  chatWidth?: number;
};

/** 放在铺满画面、position 不是 static 的容器里，自己贴左下角 */
export const PixelChatBar: React.FC<PixelChatBarProps> = ({ lines, 刻: tick, scale: s, 字体: font, width: width = 1280, height: height = 720, chatWidth = vanillaChatWidth(1) }) => {
  if (!Number.isInteger(s) || s < 1) throw new Error(`像素聊天栏的缩放要是正整数（成片像素），给的是 ${s}`);
  const ref = useRef<HTMLCanvasElement>(null);
  const uiHeight = Math.ceil((height * filmScale) / s);
  const bottomRowEdge = uiHeight - bottomGap;
  // 画布盖住 10 行（往下多 1 像素给最底一行的阴影），横向到底板右沿
  const topY = bottomRowEdge - maxLines * lineHeight;
  const canvasWidth = Math.min(chatWidth + 12, Math.ceil((width * filmScale) / s)) * s;
  const canvasHeight = (maxLines * lineHeight + 1) * s;
  const enteredLines = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => line.startTick <= tick)
    .sort((a, b) => b.line.startTick - a.line.startTick || b.i - a.i)
    .slice(0, maxLines);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    enteredLines.forEach(({ line }, lineIndex) => {
      const a = chatLineOpacity(Math.floor(tick) - Math.floor(line.startTick));
      if (!a) return;
      const lineBottom = bottomRowEdge - lineIndex * lineHeight;
      const spans: readonly TextRun[] = typeof line.text === 'string' ? [{ text: line.text }] : (line.text as readonly ChatSpan[]);
      const w = font.textWidth(spans);
      if (w > chatWidth) throw new Error(`聊天行「${spans.map((sp) => sp.text).join('')}」宽 ${w}，超过 ${chatWidth}：原版会折行，像素聊天栏还没做折行`);
      fillBox(ctx, '#000000', a.bottomAlpha, 0, lineBottom - lineHeight, chatWidth + 12, lineBottom, s, topY);
      if (line.system !== false) fillBox(ctx, systemBarColor, a.char, 0, lineBottom - lineHeight, 2, lineBottom, s, topY);
      font.draw(ctx, spans, { x: 0, y: 0 }, 4, lineBottom - 8 - topY, line.color ?? '#FFFFFF', s, { shadow: true, opacity: a.char });
    });
  });
  return (
    <canvas
      ref={ref}
      width={canvasWidth}
      height={canvasHeight}
      style={{ position: 'absolute', left: 0, top: (topY * s) / filmScale, width: canvasWidth / filmScale, height: canvasHeight / filmScale }}
    />
  );
};
