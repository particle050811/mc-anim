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
import { 成片倍数, type 像素字体, type 字段 } from './像素字表.ts';

/** TextChatBubbleData 的默认寿命（刻）；ChatBubbleManager 每 5 刻查一次过期 */
export const 气泡寿命刻 = 300;
export const 气泡检查间隔刻 = 5;
/** 1 气泡像素多少格 */
export const 气泡像素格 = 0.025;
/** 锚点离女仆脚底多高（格）：碰撞箱高 1.5（EntityMaid，坐下不变）+ 名牌偏移 0.5，坐着（isMaidInSittingPose）再低 0.25 */
export const 女仆气泡锚高 = (坐着 = false) => 1.5 + 0.5 - (坐着 ? 0.25 : 0);

export type 气泡底 = 'type1' | 'type2';
export type 气泡位置 = '中' | '左' | '右';

const 底图: Record<气泡底, string> = { type1: type1Png, type2: type2Png };
const 边距 = 5;
const 字行高 = 9;
const 折行宽: Record<气泡位置, number> = { 中: 200, 左: 120, 右: 120 };
const 尾巴u: Record<气泡位置, number> = { 右: 0, 中: 16, 左: 32 };

type 贴块 = { x: number; y: number; w: number; h: number; u: number; v: number };

// Mth.positiveCeilDiv + com.mojang.math.Divisor：total 分成 ceil(total/len) 段，余数均摊到后面
const 平分 = (total: number, len: number): number[] => {
  const n = total > 0 ? Math.ceil(total / len) : 0;
  const q = n > 0 ? Math.trunc(total / n) : 0;
  const mod = n > 0 ? total % n : 0;
  const out: number[] = [];
  let 余 = 0;
  for (let i = 0; i < n; i++) {
    let v = q;
    余 += mod;
    if (余 >= n) {
      余 -= n;
      v++;
    }
    out.push(v);
  }
  return out;
};

const 重复 = (x: number, y: number, 宽: number, 高: number, u: number, v: number, 源宽: number, 源高: number): 贴块[] => {
  const out: 贴块[] = [];
  let cx = x;
  for (const w of 平分(宽, 源宽)) {
    let cy = y;
    for (const h of 平分(高, 源高)) {
      out.push({ x: cx, y: cy, w, h, u: u + Math.trunc((源宽 - w) / 2), v: v + Math.trunc((源高 - h) / 2) });
      cy += h;
    }
    cx += w;
  }
  return out;
};

// EntityGraphics.blitNineSliced(tex, x, y, 宽, 高, 8, 8, 48, 24, 0, 0)
const 九宫格 = (x: number, y: number, 宽: number, 高: number): 贴块[] => {
  const uW = 48;
  const vH = 24;
  const l = Math.min(8, Math.trunc(宽 / 2));
  const r = l;
  const t = Math.min(8, Math.trunc(高 / 2));
  const b = t;
  const 块 = (bx: number, by: number, u: number, v: number, w: number, h: number): 贴块 => ({ x: bx, y: by, w, h, u, v });
  if (宽 === uW && 高 === vH) return [块(x, y, 0, 0, 宽, 高)];
  if (高 === vH) return [块(x, y, 0, 0, l, 高), ...重复(x + l, y, 宽 - r - l, 高, l, 0, uW - r - l, vH), 块(x + 宽 - r, y, uW - r, 0, r, 高)];
  if (宽 === uW) return [块(x, y, 0, 0, 宽, t), ...重复(x, y + t, 宽, 高 - b - t, 0, t, uW, vH - b - t), 块(x, y + 高 - b, 0, vH - b, 宽, b)];
  return [
    块(x, y, 0, 0, l, t),
    ...重复(x + l, y, 宽 - r - l, t, l, 0, uW - r - l, t),
    块(x + 宽 - r, y, uW - r, 0, r, t),
    块(x, y + 高 - b, 0, vH - b, l, b),
    ...重复(x + l, y + 高 - b, 宽 - r - l, b, l, vH - b, uW - r - l, b),
    块(x + 宽 - r, y + 高 - b, uW - r, vH - b, r, b),
    ...重复(x, y + t, l, 高 - b - t, 0, t, l, vH - b - t),
    ...重复(x + l, y + t, 宽 - r - l, 高 - b - t, l, t, uW - r - l, vH - b - t),
    ...重复(x + 宽 - r, y + t, l, 高 - b - t, uW - r, t, r, vH - b - t),
  ];
};

export type 气泡几何 = {
  行们: (string | readonly 字段[])[];
  /** 底的左上角和尺寸（气泡像素，相对锚点） */
  底: { x: number; y: number; 宽: number; 高: number };
  尾巴: 贴块;
  /** 第一行字的左上角（可能带 .5） */
  字: { x: number; y: number };
  /** 画出来的外框（整数，相对锚点）：x0..x1、y0..y1 */
  框: { x0: number; y0: number; x1: number; y1: number };
};

/** 气泡的几何（气泡像素，相对锚点）。文字是字段数组时当成一行、不折行；上移：叠在下面那些气泡之上的高度（ChatBubbleRenderer 的 y） */
export const 女仆气泡几何 = (文字: string | readonly 字段[], 字体: 像素字体, 位置: 气泡位置 = '中', 上移 = 0): 气泡几何 => {
  const 行们 = typeof 文字 === 'string' ? 字体.折行(文字, 折行宽[位置]) : [文字];
  const 字宽 = Math.max(0, ...行们.map((l) => 字体.字宽(l)));
  const 宽 = 字宽 + 2 * 边距;
  const 高 = 行们.length * 字行高 + 2 * 边距;
  const y = -高 - 上移;
  const 底 = { 中: { x: -Math.trunc(宽 / 2), y, 宽, 高 }, 左: { x: -1 - 宽, y, 宽, 高 }, 右: { x: 1, y, 宽, 高 } }[位置];
  const 尾x = { 中: -8, 左: -1 - 8, 右: 1 - 8 }[位置];
  const 尾巴: 贴块 = { x: 尾x, y: -8 - 上移, w: 16, h: 16, u: 尾巴u[位置], v: 24 };
  const 字 = { 中: { x: -宽 / 2 + 边距, y: y + 边距 }, 左: { x: -1 - 宽 + 边距, y: y + 边距 }, 右: { x: 边距 + 1, y: y + 边距 } }[位置];
  const 框 = { x0: Math.min(底.x, 尾巴.x), y0: 底.y, x1: Math.max(底.x + 宽, 尾巴.x + 16), y1: 尾巴.y + 16 };
  return { 行们, 底, 尾巴, 字, 框 };
};

/** 弹出进度 → 这一帧用的整数缩放：0 不画，1 用满，中间从 1 一级级往上跳 */
export const 弹出缩放 = (弹出: number, 缩放: number) => (弹出 <= 0 ? 0 : 弹出 >= 1 ? 缩放 : Math.max(1, Math.ceil(弹出 * 缩放)));

const 画贴块 = (ctx: CanvasRenderingContext2D, tex: Png, 块: 贴块, ox: number, oy: number, k: number) => {
  for (let j = 0; j < 块.h; j++) {
    for (let i = 0; i < 块.w; i++) {
      const o = ((块.v + j) * tex.w + 块.u + i) * 4;
      const a = tex.px[o + 3]!;
      if (a / 255 < 0.1) continue;
      ctx.fillStyle = `rgba(${tex.px[o]},${tex.px[o + 1]},${tex.px[o + 2]},${a / 255})`;
      ctx.fillRect(ox + (块.x + i) * k, oy + (块.y + j) * k, k, k);
    }
  }
};

export type 女仆气泡属性 = {
  /** 锚点：页面坐标（1280×720 那套），女仆名牌点投影到画面上的位置（投影.ts 的 投影到页面 + 女仆气泡锚高）；四舍五入到成片像素（见 锚对齐） */
  锚: { x: number; y: number };
  /** 一个气泡像素占几个成片像素（2560×1440），正整数 */
  缩放: number;
  /** 字：一句（按宽折行），或几段不同颜色的字（一行） */
  文字: string | readonly 字段[];
  /** 像素字字形表（库/界面/像素字表.ts 的 做像素字），作品自己传 */
  字体: 像素字体;
  /** 0～1，默认 1；见文件头 */
  弹出?: number;
  底?: 气泡底;
  位置?: 气泡位置;
  上移?: number;
  /** 字的默认颜色，默认游戏里的黑 */
  字色?: string;
  /** 锚点对齐到几个成片像素的格子（从页面左上角数），默认 1；要和三渲二的贴图像素格对齐就给 N */
  锚对齐?: number;
};

/** 放在铺满画面、position 不是 static 的容器里（如 AbsoluteFill），自己按锚点绝对定位 */
export const 女仆气泡: React.FC<女仆气泡属性> = ({ 锚, 缩放, 文字, 字体, 弹出 = 1, 底 = 'type2', 位置 = '中', 上移 = 0, 字色 = '#000000', 锚对齐 = 1 }) => {
  if (!Number.isInteger(缩放) || 缩放 < 1) throw new Error(`女仆气泡的缩放要是正整数（成片像素），给的是 ${缩放}`);
  const ref = useRef<HTMLCanvasElement>(null);
  const k = 弹出缩放(弹出, 缩放);
  const g = 女仆气泡几何(文字, 字体, 位置, 上移);
  const ax = Math.round((锚.x * 成片倍数) / 锚对齐) * 锚对齐;
  const ay = Math.round((锚.y * 成片倍数) / 锚对齐) * 锚对齐;
  const 宽 = (g.框.x1 - g.框.x0) * k;
  const 高 = (g.框.y1 - g.框.y0) * k;
  // 锚点在画布里的位置（画布像素）
  const ox = -g.框.x0 * k;
  const oy = -g.框.y0 * k;
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const tex = png(底图[底]);
    for (const 块 of 九宫格(g.底.x, g.底.y, g.底.宽, g.底.高)) 画贴块(ctx, tex, 块, ox, oy, k);
    画贴块(ctx, tex, g.尾巴, ox, oy, k);
    g.行们.forEach((行, i) => 字体.画(ctx, 行, { x: ox, y: oy }, g.字.x, g.字.y + i * 字行高, 字色, k));
  });
  if (k === 0) return null;
  return (
    <canvas
      ref={ref}
      width={宽}
      height={高}
      style={{ position: 'absolute', left: (ax - ox) / 成片倍数, top: (ay - oy) / 成片倍数, width: 宽 / 成片倍数, height: 高 / 成片倍数 }}
    />
  );
};
