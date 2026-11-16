// 径向轮盘画在 2D 画布上：扇形带、像素图标、背景贴图、文字格，和照 GenericRadialMenu.draw() 拼起来的原版一圈轮盘（数和出处见 径向轮盘数.ts）。
// 屏幕上用（径向轮盘.tsx）和贴到世界里的面上用（径向轮盘世界.tsx）是同一套画法。
// 和游戏不一样的只有一处：画布的扇形带边缘带抗锯齿，游戏里没有多重采样、边是锯齿的。同色相邻的格并成一条路径画，中间不会有缝；
// 不同色相邻（悬停格和两边）的交界上有一条比两边略淡的发丝线（两次半覆盖叠出来的），4K 下看不出。
import type { Png } from '@engine/model/贴图.ts';
import { drawText, textWidth } from './像素字.ts';
import { argbColor, iconTopLeft, radialWheelConst, cellRange, WheelState } from './径向轮盘数.ts';

/** 画到哪：心 = 圆心在画布上的像素坐标，倍 = 一个 GUI 像素是几个画布像素（屏幕上 = GUI 缩放 × devicePixelRatio） */
export type CanvasPos = { ctx: CanvasRenderingContext2D; centerX: number; centerY: number; scale: number };

export type BandSegment = { start: number; end: number; 色: string };

const TAU = Math.PI * 2;

/** 一圈扇形带：段按角度顺序给，首尾相接；同色相邻的并成一条路径 */
export const drawRingBands = ({ ctx, centerX, centerY, scale }: CanvasPos, innerRadius: number, outerRadius: number, segments: readonly BandSegment[]) => {
  if (outerRadius <= innerRadius || segments.length === 0) return;
  const bands: BandSegment[] = [];
  for (const ringSeg of segments) {
    const lastBand = bands[bands.length - 1];
    if (lastBand && lastBand.色 === ringSeg.色 && Math.abs(lastBand.end - ringSeg.start) < 1e-6) lastBand.end = ringSeg.end;
    else bands.push({ ...ringSeg });
  }
  if (bands.length > 1) {
    const firstBand = bands[0]!;
    const lastArc = bands[bands.length - 1]!;
    if (firstBand.色 === lastArc.色 && Math.abs(lastArc.end - TAU - firstBand.start) < 1e-6) {
      lastArc.end += firstBand.end - firstBand.start;
      bands.shift();
    }
  }
  for (const ringSeg of bands) {
    ctx.fillStyle = ringSeg.色;
    ctx.beginPath();
    if (ringSeg.end - ringSeg.start >= TAU - 1e-6) {
      ctx.arc(centerX, centerY, outerRadius * scale, 0, TAU);
      ctx.moveTo(centerX + innerRadius * scale, centerY);
      ctx.arc(centerX, centerY, innerRadius * scale, 0, TAU);
      ctx.fill('evenodd');
    } else {
      ctx.arc(centerX, centerY, outerRadius * scale, ringSeg.start, ringSeg.end);
      ctx.arc(centerX, centerY, innerRadius * scale, ringSeg.end, ringSeg.start, true);
      ctx.closePath();
      ctx.fill();
    }
  }
};

// 贴图 → 小画布（按亮度各存一份），再最近邻放大画出去
const miniCanvases = new WeakMap<Png, Map<number, HTMLCanvasElement>>();
const texCanvas = (tex: Png, brightness: number) => {
  let canvasMap = miniCanvases.get(tex);
  if (!canvasMap) miniCanvases.set(tex, (canvasMap = new Map()));
  let cv = canvasMap.get(brightness);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = tex.w;
    cv.height = tex.h;
    const ctx = cv.getContext('2d')!;
    const imageData = ctx.createImageData(tex.w, tex.h);
    for (let i = 0; i < tex.px.length; i += 4) {
      imageData.data[i] = Math.min(255, tex.px[i]! * brightness);
      imageData.data[i + 1] = Math.min(255, tex.px[i + 1]! * brightness);
      imageData.data[i + 2] = Math.min(255, tex.px[i + 2]! * brightness);
      imageData.data[i + 3] = tex.px[i + 3]!;
    }
    ctx.putImageData(imageData, 0, 0);
    canvasMap.set(brightness, cv);
  }
  return cv;
};

/** 像素贴图最近邻画出去：左、上、宽、高是 GUI 像素（相对圆心），左上角对齐到画布像素。亮度乘在颜色上（1 = 原色） */
export const drawPixelImage = ({ ctx, centerX, centerY, scale }: CanvasPos, tex: Png, left: number, top: number, width: number, height: number, options: { opacity?: number; brightness?: number } = {}) => {
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = options.opacity ?? 1;
  ctx.drawImage(texCanvas(tex, options.brightness ?? 1), Math.round(centerX + left * scale), Math.round(centerY + top * scale), w, h);
  ctx.restore();
};

/** drawBg()：256×256 的背景贴图，50% 不透明，绕圆心缩放、整体上移 1 个 GUI 像素；游戏里 GUI 贴图是最近邻采样 */
export const drawBackdrop = (canvasPos: CanvasPos, backdrop: Png, scale: number) => {
  const side = radialWheelConst.backdropSize * scale;
  drawPixelImage(canvasPos, backdrop, -side / 2, -side / 2 - radialWheelConst.backdropLift, side, side, { opacity: radialWheelConst.backdropOpacity });
};

/** TextRadialMenuItem.draw()：游戏字体、不带阴影（drawString 最后一个参数 false），默认白色（color = -1）；
 *  x = (int)(x − 字宽 / 2)（字宽 / 2 是整数除法），y = (int)(y − 4)。字只有 像素字 资产里收了的才画得出 */
export const drawTextCell = ({ ctx, centerX, centerY, scale }: CanvasPos, text: string, angle: number, radius: number, color = '#ffffff') => {
  const x = Math.floor(radius * Math.cos(angle)) - Math.floor(textWidth(text) / 2);
  const y = Math.floor(radius * Math.sin(angle)) - radialWheelConst.textLift;
  ctx.save();
  ctx.translate(Math.round(centerX), Math.round(centerY));
  drawText(ctx, text, x, y, color, scale);
  ctx.restore();
};

/** 一格放什么：物品图标（ItemStackRadialMenuItem）或一行字（TextRadialMenuItem，聚晶轮盘的「聚晶包」「提取」两格） */
export type WheelCell = { icon: Png } | { 文字: string };

export type VanillaWheelParams = {
  cell: readonly WheelCell[];
  /** 打开后第几刻（可带小数）；2.5 刻以内是打开动画，只有背景和扇形带 */
  刻: number;
  /** 悬停的那一格（鼠标所在），不给就没有 */
  selectedIdx?: number;
  /** 圆心画的物品图标（聚晶轮盘是法杖里现在装的聚晶，没装就不画） */
  centerIcon?: Png | null;
  /** customBackground：聚晶轮盘是 textures/gui/focus_wheel.png */
  backdrop?: Png | null;
};

/** 照 GenericRadialMenu.draw() 的顺序画一圈：背景 → 扇形带 → 各格图标或文字 → 圆心物品。
 *  打开动画里 draw() 给扇形带套了 translate(0, animTop)，但 drawSlices 直接往 Tesselator 写屏幕坐标、不经 GuiGraphics 的矩阵，所以扇形带始终在圆心，这里照这个实际效果画。
 *  没画的：悬停格的物品提示框（drawTooltips）、物品的数量和冷却遮罩（renderItemDecorations） */
export const drawVanillaWheel = (canvasPos: CanvasPos, { cell: wheelCells, 刻: tick, selectedIdx, centerIcon, backdrop }: VanillaWheelParams) => {
  const wheelState = WheelState(tick);
  if (!wheelState || wheelCells.length === 0) return;
  if (backdrop) drawBackdrop(canvasPos, backdrop, wheelState.patternScale);
  const hoverIdx = wheelState.animating ? -1 : (selectedIdx ?? -1); // processMouse() 只在 isReady() 时算悬停
  drawRingBands(
    canvasPos,
    wheelState.内,
    wheelState.outerRadius,
    wheelCells.map((_, i) => ({ ...cellRange(i, wheelCells.length), 色: argbColor(i === hoverIdx ? radialWheelConst.hoverColor : radialWheelConst.底色) })),
  );
  if (wheelState.animating) return;
  wheelCells.forEach((item, i) => {
    const { 中: midAngle } = cellRange(i, wheelCells.length);
    if ('icon' in item) {
      const [left, top] = iconTopLeft(midAngle, wheelState.iconRadius);
      drawPixelImage(canvasPos, item.icon, left, top, radialWheelConst.iconEdge, radialWheelConst.iconEdge);
    } else drawTextCell(canvasPos, item.文字, midAngle, wheelState.iconRadius);
  });
  // 圆心物品画在 ((width − 16) / 2, (height − 16) / 2)
  if (centerIcon) drawPixelImage(canvasPos, centerIcon, -radialWheelConst.iconEdge / 2, -radialWheelConst.iconEdge / 2, radialWheelConst.iconEdge, radialWheelConst.iconEdge);
};
