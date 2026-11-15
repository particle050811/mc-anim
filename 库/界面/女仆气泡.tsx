// 车万女仆（TLM 1.5.3）的头顶气泡，照游戏画成 2D。出处：jar 里 ChatBubbleRenderer、EntityGraphics、TextChatBubbleRenderer、EntityMaidRenderer 反编译。
// - 单位是气泡像素：游戏里 PoseStack.scale(−0.025, −0.025, 0.025) 再转成正对镜头，1 气泡像素 = 0.025 格，往右是画面右、往下是画面下。
//   锚点是女仆的名牌点（getNameTagOffsetY：脚底 + 碰撞箱高 1.5 + 0.5，坐着再 −0.25），气泡底边就在锚点上。
// - 九宫格底：宽 = 字宽 + 10、高 = 行数 × 9 + 10（四边距 5）。一个气泡时摆中间（CENTER）：底从 x = −宽/2 起（Java 整数除，向零取整），
//   尾巴 16×16 在 (−8, −8)，字从 (−宽/2 + 5, −高 + 5) 起，宽是奇数时字比底偏半个像素（照抄）。两个以上才左右排（LEFT/RIGHT，底在锚点外 1 像素）。
// - 贴图 256×256：九宫格取 (0,0) 48×24、角 8，边和中间照 blitRepeating 用 Divisor 平分、取源的中间一段重复；尾巴取 y 24 那行（右 0、中 16、左 32）。
//   尾巴压在底上（往镜头挪 0.01），透明度 < 0.1 的丢掉，所以尾巴顶上白的那几行盖掉底的下边框、开出口子。着色器 position_color_tex_lightmap 不乘光照，夜里不变暗。
// - 字：Minecraft 默认字体，颜色 0 → 不透明黑，不带阴影；折行宽 CENTER 200、两边 120。颜文字、文字气泡都用 type2（浅蓝描边）。
// - 出现、消失：游戏里没有过渡，加进来就整个出现，300 刻（15 秒）后在下一次 5 刻一查时整个消失。弹出 在 0、1 之间是演绎（Agent 暂定）：
//   缩放从 1 起按整数一级级跳到给的缩放，每一级都还是整像素。
import React, { useLayoutEffect, useRef } from 'react';
import { png, type Png } from '../../engine/model/贴图.ts';
import type1Png from 'asset:贴图/界面/女仆气泡/type1';
import type2Png from 'asset:贴图/界面/女仆气泡/type2';
import { filmScale, type PixelFont, type TextRun } from './像素字表.ts';

/** TextChatBubbleData 的默认寿命（刻）；ChatBubbleManager 每 5 刻查一次过期 */
export const bubbleLifeTicks = 300;
export const bubbleCheckIntervalTicks = 5;
/** 1 气泡像素多少格 */
export const bubblePixelSize = 0.025;
/** 锚点离女仆脚底多高（格）：碰撞箱高 1.5（EntityMaid，坐下不变）+ 名牌偏移 0.5，坐着（isMaidInSittingPose）再低 0.25 */
export const bubbleAnchorHeight = (sitting = false) => 1.5 + 0.5 - (sitting ? 0.25 : 0);

export type BubbleSkin = 'type1' | 'type2';
export type BubblePosition = '中' | '左' | '右';

const baseTexByBubble: Record<BubbleSkin, string> = { type1: type1Png, type2: type2Png };
const margin = 5;
const textLineHeight = 9;
const wrapWidth: Record<BubblePosition, number> = { 中: 200, 左: 120, 右: 120 };
const tailU: Record<BubblePosition, number> = { 右: 0, 中: 16, 左: 32 };

type Tile = { x: number; y: number; w: number; h: number; u: number; v: number };

// Mth.positiveCeilDiv + com.mojang.math.Divisor：total 分成 ceil(total/len) 段，余数均摊到后面
const splitEvenly = (total: number, len: number): number[] => {
  const n = total > 0 ? Math.ceil(total / len) : 0;
  const q = n > 0 ? Math.trunc(total / n) : 0;
  const mod = n > 0 ? total % n : 0;
  const out: number[] = [];
  let remainder = 0;
  for (let i = 0; i < n; i++) {
    let v = q;
    remainder += mod;
    if (remainder >= n) {
      remainder -= n;
      v++;
    }
    out.push(v);
  }
  return out;
};

const tiledPatch = (x: number, y: number, width: number, height: number, u: number, v: number, srcWidth: number, srcHeight: number): Tile[] => {
  const out: Tile[] = [];
  let cx = x;
  for (const w of splitEvenly(width, srcWidth)) {
    let cy = y;
    for (const h of splitEvenly(height, srcHeight)) {
      out.push({ x: cx, y: cy, w, h, u: u + Math.trunc((srcWidth - w) / 2), v: v + Math.trunc((srcHeight - h) / 2) });
      cy += h;
    }
    cx += w;
  }
  return out;
};

// EntityGraphics.blitNineSliced(tex, x, y, 宽, 高, 8, 8, 48, 24, 0, 0)
const nineSlice = (x: number, y: number, width: number, height: number): Tile[] => {
  const uW = 48;
  const vH = 24;
  const l = Math.min(8, Math.trunc(width / 2));
  const r = l;
  const t = Math.min(8, Math.trunc(height / 2));
  const b = t;
  const patchRect = (bx: number, by: number, u: number, v: number, w: number, h: number): Tile => ({ x: bx, y: by, w, h, u, v });
  if (width === uW && height === vH) return [patchRect(x, y, 0, 0, width, height)];
  if (height === vH) return [patchRect(x, y, 0, 0, l, height), ...tiledPatch(x + l, y, width - r - l, height, l, 0, uW - r - l, vH), patchRect(x + width - r, y, uW - r, 0, r, height)];
  if (width === uW) return [patchRect(x, y, 0, 0, width, t), ...tiledPatch(x, y + t, width, height - b - t, 0, t, uW, vH - b - t), patchRect(x, y + height - b, 0, vH - b, width, b)];
  return [
    patchRect(x, y, 0, 0, l, t),
    ...tiledPatch(x + l, y, width - r - l, t, l, 0, uW - r - l, t),
    patchRect(x + width - r, y, uW - r, 0, r, t),
    patchRect(x, y + height - b, 0, vH - b, l, b),
    ...tiledPatch(x + l, y + height - b, width - r - l, b, l, vH - b, uW - r - l, b),
    patchRect(x + width - r, y + height - b, uW - r, vH - b, r, b),
    ...tiledPatch(x, y + t, l, height - b - t, 0, t, l, vH - b - t),
    ...tiledPatch(x + l, y + t, width - r - l, height - b - t, l, t, uW - r - l, vH - b - t),
    ...tiledPatch(x + width - r, y + t, l, height - b - t, uW - r, t, r, vH - b - t),
  ];
};

export type BubbleGeom = {
  lines: (string | readonly TextRun[])[];
  /** 底的左上角和尺寸（气泡像素，相对锚点） */
  bottomBox: { x: number; y: number; 宽: number; 高: number };
  tail: Tile;
  /** 第一行字的左上角（可能带 .5） */
  字: { x: number; y: number };
  /** 画出来的外框（整数，相对锚点）：x0..x1、y0..y1 */
  框: { x0: number; y0: number; x1: number; y1: number };
};

/** 气泡的几何（气泡像素，相对锚点）。文字是字段数组时当成一行、不折行；上移：叠在下面那些气泡之上的高度（ChatBubbleRenderer 的 y） */
export const maidBubbleGeom = (text: string | readonly TextRun[], font: PixelFont, bubblePos: BubblePosition = '中', lift = 0): BubbleGeom => {
  const lines = typeof text === 'string' ? font.wrapText(text, wrapWidth[bubblePos]) : [text];
  const textWidth = Math.max(0, ...lines.map((l) => font.textWidth(l)));
  const width = textWidth + 2 * margin;
  const height = lines.length * textLineHeight + 2 * margin;
  const y = -height - lift;
  const bottomBoxes = { 中: { x: -Math.trunc(width / 2), y, 宽: width, 高: height }, 左: { x: -1 - width, y, 宽: width, 高: height }, 右: { x: 1, y, 宽: width, 高: height } }[bubblePos];
  const tailX = { 中: -8, 左: -1 - 8, 右: 1 - 8 }[bubblePos];
  const tail: Tile = { x: tailX, y: -8 - lift, w: 16, h: 16, u: tailU[bubblePos], v: 24 };
  const textAnchors = { 中: { x: -width / 2 + margin, y: y + margin }, 左: { x: -1 - width + margin, y: y + margin }, 右: { x: margin + 1, y: y + margin } }[bubblePos];
  const bounds = { x0: Math.min(bottomBoxes.x, tail.x), y0: bottomBoxes.y, x1: Math.max(bottomBoxes.x + width, tail.x + 16), y1: tail.y + 16 };
  return { lines, bottomBox: bottomBoxes, tail, 字: textAnchors, 框: bounds };
};

/** 弹出进度 → 这一帧用的整数缩放：0 不画，1 用满，中间从 1 一级级往上跳 */
export const popScale = (popProgress: number, scale: number) => (popProgress <= 0 ? 0 : popProgress >= 1 ? scale : Math.max(1, Math.ceil(popProgress * scale)));

const drawTile = (ctx: CanvasRenderingContext2D, tex: Png, patch: Tile, ox: number, oy: number, k: number) => {
  for (let j = 0; j < patch.h; j++) {
    for (let i = 0; i < patch.w; i++) {
      const o = ((patch.v + j) * tex.w + patch.u + i) * 4;
      const a = tex.px[o + 3]!;
      if (a / 255 < 0.1) continue;
      ctx.fillStyle = `rgba(${tex.px[o]},${tex.px[o + 1]},${tex.px[o + 2]},${a / 255})`;
      ctx.fillRect(ox + (patch.x + i) * k, oy + (patch.y + j) * k, k, k);
    }
  }
};

export type MaidBubbleProps = {
  /** 锚点：页面坐标（1280×720 那套），女仆名牌点投影到画面上的位置（投影.ts 的 投影到页面 + 女仆气泡锚高）；四舍五入到成片像素（见 锚对齐） */
  锚: { x: number; y: number };
  /** 一个气泡像素占几个成片像素（2560×1440），正整数 */
  缩放: number;
  /** 字：一句（按宽折行），或几段不同颜色的字（一行） */
  文字: string | readonly TextRun[];
  /** 像素字字形表（库/界面/像素字表.ts 的 做像素字），作品自己传 */
  字体: PixelFont;
  /** 0～1，默认 1；见文件头 */
  popProgress?: number;
  bottomStyle?: BubbleSkin;
  位置?: BubblePosition;
  lift?: number;
  /** 字的默认颜色，默认游戏里的黑 */
  textColor?: string;
  /** 锚点对齐到几个成片像素的格子（从页面左上角数），默认 1；要和三渲二的贴图像素格对齐就给 N */
  anchorAlign?: number;
};

/** 放在铺满画面、position 不是 static 的容器里（如 AbsoluteFill），自己按锚点绝对定位 */
export const MaidBubble: React.FC<MaidBubbleProps> = ({ 锚: anchor, 缩放: scale, 文字: text, 字体: font, popProgress = 1, bottomStyle = 'type2', 位置: bubblePos = '中', lift = 0, textColor = '#000000', anchorAlign = 1 }) => {
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`女仆气泡的缩放要是正整数（成片像素），给的是 ${scale}`);
  const ref = useRef<HTMLCanvasElement>(null);
  const k = popScale(popProgress, scale);
  const g = maidBubbleGeom(text, font, bubblePos, lift);
  const ax = Math.round((anchor.x * filmScale) / anchorAlign) * anchorAlign;
  const ay = Math.round((anchor.y * filmScale) / anchorAlign) * anchorAlign;
  const width = (g.框.x1 - g.框.x0) * k;
  const height = (g.框.y1 - g.框.y0) * k;
  // 锚点在画布里的位置（画布像素）
  const ox = -g.框.x0 * k;
  const oy = -g.框.y0 * k;
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const tex = png(baseTexByBubble[bottomStyle]);
    for (const patch of nineSlice(g.bottomBox.x, g.bottomBox.y, g.bottomBox.宽, g.bottomBox.高)) drawTile(ctx, tex, patch, ox, oy, k);
    drawTile(ctx, tex, g.tail, ox, oy, k);
    g.lines.forEach((line, i) => font.draw(ctx, line, { x: ox, y: oy }, g.字.x, g.字.y + i * textLineHeight, textColor, k));
  });
  if (k === 0) return null;
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{ position: 'absolute', left: (ax - ox) / filmScale, top: (ay - oy) / filmScale, width: width / filmScale, height: height / filmScale }}
    />
  );
};
