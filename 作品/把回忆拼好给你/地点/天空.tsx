// 侧剖面的天：画在三维画布后面的一张 2D 画布（三维画布透明），颜色从地平线往上渐变，一个贴图像素一行；太阳、月亮用原版贴图的本体按 天体.ts 的位置画，
// 贴图像素对齐到方块的像素格上，原版贴图里本体外面那圈平滑光晕不画，换成几圈硬边色阶（见 光圈）。
// 原版画太阳、月亮是叠加混合（blendFuncSeparate(SRC_ALPHA, ONE, …)），这里用 lighter，贴图黑底叠上去就没了。
// 画在 2D 里：三渲二的斜投影不影响它，房子、树照样挡在前面（三维画布不给 天，背景透明）；每帧重画同一张画布，不新建贴图。
// 渐变、贴图像素格从剖面（y = 0）上的地面线、门洞西边数起。
// 画布按成片分辨率建（页面尺寸 × 成片倍数），预览级由浏览器缩小（同 库/界面/像素聊天栏.tsx）。
import React, { useLayoutEffect, useRef } from 'react';
import { type Png, png } from '@engine/model/贴图.ts';
import sunPng from 'asset:贴图/环境/太阳';
import moonPng from 'asset:贴图/环境/月相';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import type { 侧取景 } from './侧剖面.tsx';
import { 天亮, 天体位置, type 天弧 } from './天体.ts';

/** 天色：地平 = 地面线那里的颜色，顶 = 往上 渐变高 格以上的颜色（sRGB）；夜里两个都换成 夜 的颜色（按 天亮 混） */
export type 天色 = { 地平: string; 顶: string; 渐变高: number; 夜地平: string; 夜顶: string };

const 解色 = (s: string) => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
// 按 sRGB 数值插（像素画的渐变）
const 混 = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);

/** 太阳、月亮贴图一格 32×32 像素，画出来一个贴图像素 = 方块的一个贴图像素。本体是正中 8×8（第 12～19 个贴图像素，半格见方），外面是光晕 */
const 天体边 = 32;
const 本体起 = 12;
const 本体边 = 8;

/** 原版光晕（本体外一圈一圈淡下去，从 40/255 淡到 1/255）不画，换成本体外面这几圈硬边色阶：每圈 宽 个贴图像素，对齐贴图像素格，
 *  颜色 = 原版光晕紧挨本体那一格的颜色 × 亮（叠加上去，太阳偏暖黄、月亮偏蓝）。
 *  五家评审 10-24 都说平滑光晕是 CG 味（主会话定：只留原版方块太阳月亮，最多一两圈硬边色阶）；两圈各一个贴图像素是五家评审 10-24 后 Agent 暂定 */
const 光圈: readonly { 宽: number; 亮: number }[] = [
  { 宽: 1, 亮: 1 },
  { 宽: 1, 亮: 0.5 },
];

/** 画一个太阳或月亮：(u0, v0) 是贴图里那一格的左上角，(x0, y0) 是这一格 32×32 画在画布上的左上角，n = 一个贴图像素几个画布像素 */
const 画天体 = (ctx: CanvasRenderingContext2D, tex: Png, u0: number, v0: number, x0: number, y0: number, n: number, 透 = 1, 带光圈 = true) => {
  for (let v = 本体起; v < 本体起 + 本体边; v++)
    for (let u = 本体起; u < 本体起 + 本体边; u++) {
      const o = ((v0 + v) * tex.w + u0 + u) * 4;
      const a = tex.px[o + 3]!;
      if (!a || !(tex.px[o]! | tex.px[o + 1]! | tex.px[o + 2]!)) continue;
      ctx.fillStyle = `rgba(${tex.px[o]},${tex.px[o + 1]},${tex.px[o + 2]},${(a / 255) * 透})`;
      ctx.fillRect(x0 + u * n, y0 + v * n, n, n);
    }
  if (!带光圈) return;
  const 晕 = ((v0 + 本体起 - 1) * tex.w + u0 + 天体边 / 2) * 4; // 本体正上方紧挨着的那格光晕
  const 色 = [tex.px[晕]!, tex.px[晕 + 1]!, tex.px[晕 + 2]!];
  const bx = x0 + 本体起 * n, by = y0 + 本体起 * n, 边 = 本体边 * n;
  let 内 = 0; // 这一圈内沿离本体几个画布像素
  for (const { 宽, 亮 } of 光圈) {
    const t = 宽 * n;
    ctx.fillStyle = `rgba(${色.map((c) => Math.round(c * 亮)).join(',')},${透})`;
    // 上下左右四条，互不重叠（lighter 是叠加，重叠的地方会更亮）
    ctx.fillRect(bx - 内 - t, by - 内 - t, 边 + 2 * (内 + t), t);
    ctx.fillRect(bx - 内 - t, by + 边 + 内, 边 + 2 * (内 + t), t);
    ctx.fillRect(bx - 内 - t, by - 内, t, 边 + 2 * 内);
    ctx.fillRect(bx + 边 + 内, by - 内, t, 边 + 2 * 内);
    内 += t;
  }
};

export type 侧剖面天空属性 = {
  取景: 侧取景;
  /** 画布的页面尺寸（和三维画布一样） */
  宽: number;
  高: number;
  色: 天色;
  /** 游戏刻（天体.ts） */
  刻?: number;
  /** 太阳月亮走的弧，不给就不画太阳月亮 */
  弧?: 天弧;
  /** 天随昼夜变暗的程度（1 照原版，0 一直白天的颜色），第 13 句快转时压低 */
  明暗幅度?: number;
  /** 快转时太阳、月亮身后的残影：再画 张 个早 刻差、2·刻差…刻的位置（只画本体、不带光圈），最近的不透明度 首透，往后按张数线性变淡；不给不画 */
  残影?: { 张: number; 刻差: number; 首透: number };
  style?: React.CSSProperties;
};

/** 放在三维画布后面（同一个定位容器里、先画），自己铺满 宽 × 高 */
export const 侧剖面天空: React.FC<侧剖面天空属性> = ({ 取景, 宽, 高, 色, 刻 = 6000, 弧, 明暗幅度 = 1, 残影, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数, H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const { 中心, 每格 } = 取景;
    const n = 每格 / 16; // 一个贴图像素几个画布像素
    // 地面线、门洞西边（x = −0.5）在画布上的位置：贴图像素的格从这里数
    const 地y = H / 2 + 中心[1] * 每格;
    const 格x0 = W / 2 + (-0.5 - 中心[0]) * 每格;
    const 亮 = 1 - 明暗幅度 * (1 - 天亮(刻));
    const 地平 = 混(解色(色.夜地平), 解色(色.地平), 亮);
    const 顶 = 混(解色(色.夜顶), 解色(色.顶), 亮);
    ctx.globalCompositeOperation = 'source-over';
    for (let r = -Math.ceil((H - 地y) / n); r * n < 地y; r++) {
      const z = (r + 0.5) / 16;
      const c = 混(地平, 顶, Math.sqrt(Math.min(1, Math.max(0, z / 色.渐变高))));
      ctx.fillStyle = `rgb(${c.map(Math.round).join(',')})`;
      ctx.fillRect(0, 地y - (r + 1) * n, W, n);
    }
    if (!弧) return;
    const 吸 = (v: number, 原: number) => 原 + Math.round((v - 原) / n) * n;
    ctx.globalCompositeOperation = 'lighter';
    const 画 = (tex: Png, u0: number, v0: number, x: number, z: number, 透?: number, 带光圈?: boolean) => {
      const px = 吸(W / 2 + (x - 中心[0]) * 每格 - (天体边 * n) / 2, 格x0);
      const py = 吸(H / 2 - (z - 中心[1]) * 每格 - (天体边 * n) / 2, 地y);
      画天体(ctx, tex, u0, v0, px, py, n, 透, 带光圈);
    };
    const 画两个 = (t: number, 透?: number, 带光圈?: boolean) => {
      const 位 = 天体位置(t, 弧);
      画(png(sunPng), 0, 0, 位.太阳.x, 位.太阳.z, 透, 带光圈);
      画(png(moonPng), (位.月亮.相 % 4) * 天体边, Math.floor(位.月亮.相 / 4) * 天体边, 位.月亮.x, 位.月亮.z, 透, 带光圈);
    };
    // 残影从最远（最淡）的画起；不带光圈（主会话 10-24 定分屏的轨迹不发光）
    if (残影) for (let i = 残影.张; i >= 1; i--) 画两个(刻 - i * 残影.刻差, (残影.首透 * (残影.张 - i + 1)) / 残影.张, false);
    画两个(刻);
    ctx.globalCompositeOperation = 'source-over';
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, ...style }} />;
};
