// 游戏界面层的基础件：文字、像素贴图（物品图标，带附魔光效和帧动画）、方块物品的 3D 图标、原版物品提示框。
// 用户 09-30 定：排版照原版、自制更好看的前端界面：不截游戏图、不放大 GUI 贴图，排版、贴图、文字照模组里的（出处写在用到的地方），面板用矢量、文字用系统中文字体，
// 只有物品图标保留 16×16 像素（按显示尺寸逐像素放大，不糊）。
// 坐标统一用「GUI 像素」，乘缩放 s 得到画面像素；1280×720 里 s 取 2.5 左右，和游戏界面尺寸「大」差不多。画布同步画（`useLayoutEffect`），Remotion 逐帧截图不会截早。
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import type { Png } from '../../engine/model/贴图.ts';
import type { BlockModelData } from '../../engine/model/方块模型.tsx';

export const uiFontFamily = '"PingFang SC", "Hiragino Sans GB", "Heiti SC", sans-serif';

// 原版 `ChatFormatting` 的颜色（物品名的稀有度颜色、提示框里的灰字、JEI 的模组名）
export const chatColors = {
  white: '#FFFFFF',
  gray: '#AAAAAA',
  darkGray: '#555555',
  yellow: '#FFFF55', // 稀有度 UNCOMMON：附魔书、古卷
  lightPurple: '#FF55FF', // 稀有度 EPIC：超过上限的附魔书（夸克 `AncientTomesModule` 把超限的书设成 EPIC）
  blue: '#5555FF', // JEI 在提示框最后一行用蓝色斜体写模组名
  green: '#80FF20', // 铁砧「附魔花费」够等级时的颜色（JEI `ANVIL_EXPERIENCE_COST_TEXT`）
};

// 原版文字阴影：颜色 ×0.25，往右下错 1 个 GUI 像素；高清画法里错开量随字号走
const shadowColor = (color: string) => {
  const rgbInt = parseInt(color.slice(1), 16);
  const k = (v: number) => Math.floor(v / 4);
  return `rgb(${k((rgbInt >> 16) & 255)},${k((rgbInt >> 8) & 255)},${k(rgbInt & 255)})`;
};

export const UiText: React.FC<{ color?: string; fontSize: number; shadow?: boolean; italic?: boolean; bold?: boolean; style?: React.CSSProperties; children: React.ReactNode }> = ({
  color: color = chatColors.white,
  fontSize: fontSize,
  shadow = true,
  italic,
  bold,
  style,
  children,
}) => (
  <span
    style={{
      fontFamily: uiFontFamily,
      fontSize,
      lineHeight: 1.25,
      color,
      fontStyle: italic ? 'italic' : undefined,
      fontWeight: bold ? 600 : 400,
      textShadow: shadow ? `${fontSize * 0.08}px ${fontSize * 0.08}px 0 ${shadowColor(color)}` : undefined,
      whiteSpace: 'pre',
      ...style,
    }}
  >
    {children}
  </span>
);

// ---------- 像素贴图 ----------
// 多层物品贴图先叠成一张（药水瓶这类：瓶里的东西 + 瓶身）
export const stackLayers = (layers: Png[]): Png => {
  const { w: width, h: height } = layers[0];
  const px = new Uint8Array(width * height * 4);
  for (const layer of layers) {
    for (let i = 0; i < width * height; i++) {
      const srcAlpha = layer.px[i * 4 + 3] / 255;
      if (!srcAlpha) continue;
      const oa = px[i * 4 + 3] / 255;
      const na = srcAlpha + oa * (1 - srcAlpha);
      for (let k = 0; k < 3; k++) px[i * 4 + k] = Math.round((layer.px[i * 4 + k] * srcAlpha + px[i * 4 + k] * oa * (1 - srcAlpha)) / na);
      px[i * 4 + 3] = Math.round(na * 255);
    }
  }
  return { w: width, h: height, px };
};

// 附魔光效：照原版 `RenderStateShard.setupGlintTexturing(8)`——光效贴图坐标放大 8 倍、转 10°，再平移 (-f, g)，f 每 110000/8 毫秒、g 每 30000/8 毫秒走完一圈；混合 GL_SRC_COLOR, GL_ONE，即 底色 + 光效²。
// 原版按物品在图集里的 UV 采样；这里按图标坐标取 1/4（条纹比原版密，几秒里看得出在流动），亮度乘 0.6（原版紫色在高清图标上太冲）。
export type Glint = { tex: Png; time: number };
const sampleGlint = (glint: Glint, iconU: number, iconV: number): [number, number, number] => {
  const scrollU = ((glint.time * 8000) % 110000) / 110000;
  const gg = ((glint.time * 8000) % 30000) / 30000;
  const cosRot = Math.cos(0.17453292), sinRot = Math.sin(0.17453292);
  const glintU = (cosRot * iconU - sinRot * iconV) * 0.25 - scrollU;
  const glintV = (sinRot * iconU + cosRot * iconV) * 0.25 + gg;
  const { w: texWidth, h: texHeight, px } = glint.tex;
  const x = ((Math.floor(glintU * texWidth) % texWidth) + texWidth) % texWidth;
  const y = ((Math.floor(glintV * texHeight) % texHeight) + texHeight) % texHeight;
  const i = (y * texWidth + x) * 4;
  return [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
};

// tex：贴图（帧动画是竖着排的一列，帧数 = 高 / 宽）；大小：显示边长（画面像素）；帧：小数时在前后两帧之间插值（mcmeta 的 interpolate）
export const PixelSprite: React.FC<{ tex: Png; size: number; frame?: number; glint?: Glint | null; brightness?: number; style?: React.CSSProperties }> = ({ tex, size: sizePx, frame: frame = 0, glint: glint, brightness = 1, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const canvasSize = Math.max(1, Math.round(sizePx * dpr));
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(canvasSize, canvasSize);
    const frameSize = tex.w;
    const frames = Math.max(1, Math.floor(tex.h / frameSize));
    const f0 = ((Math.floor(frame) % frames) + frames) % frames;
    const f1 = (f0 + 1) % frames;
    const t = frame - Math.floor(frame);
    for (let y = 0; y < canvasSize; y++) {
      const iy = Math.min(frameSize - 1, Math.floor((y * frameSize) / canvasSize));
      for (let x = 0; x < canvasSize; x++) {
        const ix = Math.min(frameSize - 1, Math.floor((x * frameSize) / canvasSize));
        const idxFrame0 = ((f0 * frameSize + iy) * frameSize + ix) * 4;
        const idxFrame1 = ((f1 * frameSize + iy) * frameSize + ix) * 4;
        const outIdx = (y * canvasSize + x) * 4;
        const al = tex.px[idxFrame0 + 3] * (1 - t) + tex.px[idxFrame1 + 3] * t;
        if (al === 0) continue;
        let red = (tex.px[idxFrame0] * (1 - t) + tex.px[idxFrame1] * t) * brightness;
        let gr = (tex.px[idxFrame0 + 1] * (1 - t) + tex.px[idxFrame1 + 1] * t) * brightness;
        let bl = (tex.px[idxFrame0 + 2] * (1 - t) + tex.px[idxFrame1 + 2] * t) * brightness;
        if (glint) {
          const glintRgb = sampleGlint(glint, x / canvasSize, y / canvasSize);
          red += glintRgb[0] * glintRgb[0] * 255 * 0.6;
          gr += glintRgb[1] * glintRgb[1] * 255 * 0.6;
          bl += glintRgb[2] * glintRgb[2] * 255 * 0.6;
        }
        img.data[outIdx] = Math.min(255, red);
        img.data[outIdx + 1] = Math.min(255, gr);
        img.data[outIdx + 2] = Math.min(255, bl);
        img.data[outIdx + 3] = al;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  return <canvas ref={ref} width={canvasSize} height={canvasSize} style={{ width: sizePx, height: sizePx, display: 'block', ...style }} />;
};

// ---------- 方块物品的 3D 图标 ----------
// 方块物品在物品栏里是斜着看的小方块：照模型 json 的 display.gui（block/block：转 [30, 225, 0]、缩 0.625），正交投影。面正交投影后是平行四边形，贴图用仿射变换整张画上去（最近邻，不糊），面按远近从后往前画。
// 明暗按面朝向取原版方块面亮度（上 1.0、南北 0.8、东西 0.6、下 0.5）。数据：工具/游戏取材/导出模型.py 导出的方块模型（导出坐标 X 0..1、Y -1..0、Z 0..1，游戏里的北 = +Y、上 = +Z）。
const D2R = Math.PI / 180;
const projectToGui = (point: number[]) => {
  // 换回游戏模型坐标（x 东、y 上、z 南），以方块中心为原点
  let x = point[0] - 0.5, y = point[2] - 0.5, z = -point[1] - 0.5;
  // `ItemTransform`：rotationXYZ(30°, 225°, 0) = Rx·Ry，先绕 Y 再绕 X
  const cy = Math.cos(225 * D2R), sy = Math.sin(225 * D2R);
  [x, z] = [cy * x + sy * z, -sy * x + cy * z];
  const cx = Math.cos(30 * D2R), sx = Math.sin(30 * D2R);
  [y, z] = [cx * y - sx * z, sx * y + cx * z];
  // GUI 里物品占 16×16，原点在中心，屏幕 y 朝下
  return [8 + x * 0.625 * 16, 8 - y * 0.625 * 16, z];
};
const faceBrightness = (n: number[]) => (n[2] > 0.5 ? 1 : n[2] < -0.5 ? 0.5 : Math.abs(n[1]) > 0.5 ? 0.8 : 0.6);

export const BlockIcon: React.FC<{ data: BlockModelData; atlas: Png; part: string; size: number; style?: React.CSSProperties }> = ({ data, atlas, part, size: sizePx, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const canvasSize = Math.max(1, Math.round(sizePx * dpr));
  // 每张贴图按三种亮度各切一份小画布
  const tiles = useMemo(() => {
    const out = new Map<string, HTMLCanvasElement>();
    return (ti: number, k: number) => {
      const key = `${ti}:${k}`;
      let tileCanvas = out.get(key);
      if (!tileCanvas) {
        const t = data.textures[ti];
        tileCanvas = document.createElement('canvas');
        tileCanvas.width = tileCanvas.height = t.size;
        const ctx = tileCanvas.getContext('2d')!;
        const img = ctx.createImageData(t.size, t.size);
        for (let y = 0; y < t.size; y++)
          for (let x = 0; x < t.size; x++) {
            const i = ((t.y + y) * atlas.w + t.x + x) * 4;
            const outIdx = (y * t.size + x) * 4;
            img.data[outIdx] = atlas.px[i] * k;
            img.data[outIdx + 1] = atlas.px[i + 1] * k;
            img.data[outIdx + 2] = atlas.px[i + 2] * k;
            img.data[outIdx + 3] = atlas.px[i + 3];
          }
        ctx.putImageData(img, 0, 0);
        out.set(key, tileCanvas);
      }
      return tileCanvas;
    };
  }, [data, atlas]);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.imageSmoothingEnabled = false;
    const k = canvasSize / 16;
    const quads = data.parts[part].quads
      .map((quad) => {
        const screenPts = [0, 1, 2, 3].map((i) => projectToGui([quad[1 + i * 3], quad[2 + i * 3], quad[3 + i * 3]]));
        const nv = projectToGui([quad[21] + 0.5, quad[22] - 0.5, quad[23] + 0.5]); // 法线也转过去（以中心为原点的方向）
        const facing = nv[2] - projectToGui([0.5, -0.5, 0.5])[2];
        return { q: quad, P: screenPts, facing, depth: (screenPts[0][2] + screenPts[1][2] + screenPts[2][2] + screenPts[3][2]) / 4 };
      })
      .filter((o) => o.facing > 1e-4) // 背对镜头的面不画
      .sort((a, b) => a.depth - b.depth);
    for (const { q: quad, P: screenPts } of quads) {
      const t = data.textures[quad[0]];
      const uv = [0, 1, 2, 3].map((i) => [quad[13 + i * 2] * t.size, quad[14 + i * 2] * t.size]);
      // 贴图坐标 → 画面坐标的仿射变换：用角 0、1、3 三个点解
      const du1 = [uv[1][0] - uv[0][0], uv[1][1] - uv[0][1]];
      const du3 = [uv[3][0] - uv[0][0], uv[3][1] - uv[0][1]];
      const det = du1[0] * du3[1] - du1[1] * du3[0];
      if (Math.abs(det) < 1e-9) continue;
      const dp1 = [(screenPts[1][0] - screenPts[0][0]) * k, (screenPts[1][1] - screenPts[0][1]) * k];
      const dp3 = [(screenPts[3][0] - screenPts[0][0]) * k, (screenPts[3][1] - screenPts[0][1]) * k];
      // [a b; c d] 把 (du, dv) 映射到 (dx, dy)
      const xFromU = (dp1[0] * du3[1] - dp3[0] * du1[1]) / det;
      const xFromV = (dp3[0] * du1[0] - dp1[0] * du3[0]) / det;
      const yFromU = (dp1[1] * du3[1] - dp3[1] * du1[1]) / det;
      const yFromV = (dp3[1] * du1[0] - dp1[1] * du3[0]) / det;
      const offsetX = screenPts[0][0] * k - xFromU * uv[0][0] - xFromV * uv[0][1];
      const offsetY = screenPts[0][1] * k - yFromU * uv[0][0] - yFromV * uv[0][1];
      ctx.save();
      // 裁成这个面，往外扩 0.35 像素，相邻两个面之间不留缝
      const cx = (screenPts[0][0] + screenPts[2][0]) / 2, cy = (screenPts[0][1] + screenPts[2][1]) / 2;
      ctx.beginPath();
      screenPts.forEach((corner, i) => {
        const dx = corner[0] - cx, dy = corner[1] - cy, dist = Math.hypot(dx, dy) || 1;
        const grownX = (corner[0] + ((dx / dist) * 0.35) / k) * k, grownY = (corner[1] + ((dy / dist) * 0.35) / k) * k;
        if (i === 0) ctx.moveTo(grownX, grownY);
        else ctx.lineTo(grownX, grownY);
      });
      ctx.closePath();
      ctx.clip();
      ctx.setTransform(xFromU, yFromU, xFromV, yFromV, offsetX, offsetY);
      ctx.drawImage(tiles(quad[0], faceBrightness([quad[21], quad[22], quad[23]])), 0, 0);
      ctx.restore();
    }
  });
  return <canvas ref={ref} width={canvasSize} height={canvasSize} style={{ width: sizePx, height: sizePx, display: 'block', ...style }} />;
};

// ---------- 原版物品提示框 ----------
// 照原版 `TooltipRenderUtil`：底色 #F0100010，里面一圈 1 像素紫色渐变边（#505000FF → #5028007F），第一行物品名、下面几行灰字，物品名和第二行之间多空 2 像素；JEI 在最后一行用蓝色斜体写模组名。
// 最宽（GUI 像素）：太长的行折行（Forge 的 `ForgeHooksClient.gatherTooltipComponents` 在两边都放不下时按鼠标到屏幕边的距离折行；这里给固定宽度）。
export type TooltipLine = { text: string; color?: string; italic?: boolean };
export const Tooltip: React.FC<{ lines: TooltipLine[]; s: number; maxWidth?: number; style?: React.CSSProperties }> = ({ lines: lines, s: scale, maxWidth: maxWidth, style }) => {
  const fs = 8.6 * scale; // 原版字高 9 像素（含行距 1）
  return (
    <div
      style={{
        position: 'absolute',
        background: 'rgba(16,0,16,0.94)',
        borderRadius: 1.5 * scale,
        padding: `${3.5 * scale}px ${4 * scale}px`,
        boxShadow: `0 ${2 * scale}px ${6 * scale}px rgba(0,0,0,0.35)`,
        ...(maxWidth ? { width: 'max-content', maxWidth: maxWidth * scale } : null),
        ...style,
      }}
    >
      {/* 紫色渐变边：内缩 1 像素的一圈 */}
      <div style={{ position: 'absolute', inset: scale, border: `${scale}px solid`, borderImage: 'linear-gradient(#5000FF50, #28007F50) 1' }} />
      {lines.map((l, i) => (
        <div key={i} style={{ marginTop: i === 1 ? 2 * scale : 0, position: 'relative' }}>
          <UiText fontSize={fs} color={l.color ?? (i === 0 ? chatColors.white : chatColors.gray)} italic={l.italic} style={maxWidth ? { whiteSpace: 'normal', display: 'block', lineBreak: 'anywhere' } : undefined}>
            {l.text}
          </UiText>
        </div>
      ))}
    </div>
  );
};
