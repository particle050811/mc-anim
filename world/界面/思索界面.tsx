// 思索（Ponder）界面的外框：机械动力 6.0.8 内嵌的 Ponder-Forge-1.20.1-1.0.91 的界面，照游戏里的样子画在 2D 画布上（用户 10-05 要求）。
// 版式、颜色、贴图都是从 jar 里 javap 反汇编读的，不自己设计（颜色常数见下面各色的注释）：
// - 底：原版 Screen.renderBackground 在世界画面上盖上下渐变的暗色（#C0101010 → #D0101010）。
// - 左上角（PonderUI.renderSceneInformation，原点 (55, 19)）：两道横的暗带（UIRenderHelper.streak，不透明度 0.625 → 0.5 → 0.0625 → 0，
//   往右长 70 + 标题宽、往左长 30，高 26 + 标题行高），30×30 物品框（纯黑底，边框渐变），框里放大 2 倍的物品；
//   框右边 (4, 6) 处灰字「思索……」，下面 14 像素是标题，折行宽 180。
// - 底部按钮（PonderUI.init）：20×20，y = 高 − 51；最左「显示方块名称」x = (宽 − 20) / 2 − 86，往右隔 58 是上一个、隔 28 关闭、隔 28 下一个、隔 58 重放；
//   最右「舒适阅读」x = 宽 − 51。图标是 widgets.png 里 16×16 的格子（PonderGuiTextures：左 (0,2)、关 (1,2)、右 (2,2)、名称 (3,2)、重放 (4,2)、舒适阅读 (6,2)）。
// - 进度条（PonderProgressBar）：x = 宽 / 2 − 110（整数除），y = 按钮下沿 + 4，宽 = 界面宽 − 2x、高 1；进度从 x − 2 起长 (宽 + 4) × 进度，两行 #80AAAADD、一行 #50AAAADD。
//   关键帧是 2×5 像素的竖条（z 320 压在进度条 310 前），位置 x − 2 + (宽 + 2) × 关键帧位置。
// - 说明框（TextWindowElement）：框在被指的点同一高度，x = 宽 × (0.75 − 0.125 × d²) − 10（d = (高 / 2 − 点的 y − 10) / 100），折行宽 min(宽 − x, 180)；
//   底色纯黑，框不跟着淡入（淡入到 1/16 就整个出现）；字色是框调色和 #FFFFDD 各半，不加阴影，不透明度跟着淡入（最低 5/255）。
//   引线从被指的点横拉到框边再伸进框里十几像素，随淡入从点往框长出去，两行像素（上字色、下 #494949 → #393939 渐变当阴影）；z 300 在框（299）前、字（800）后。
// 框（BoxElement）照原版物品提示框：底色往外扩 3 像素、四角缺一格，边框是最外 1 像素，上下渐变。
// 坐标是界面像素（1280×720 窗口自动缩放 3：高 240、宽 ceil(1280 / 3) = 427），乘 s 得画面像素。
import { drawText, wrapText, textWidth, lineHeight } from './像素字.ts';
import { png } from '../../engine/model/贴图.ts';
import widgetsPng from 'asset:贴图/界面/思索控件';

export const ponderScreen = { W: 427, H: 240, s: 3 };

// 颜色：[a, r, g, b]（0～255）
type Argb = [number, number, number, number];
const hex = (n: number): Argb => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export const ponderColors = {
  bgTop: hex(0xc0101010),
  bgBottom: hex(0xd0101010),
  black: hex(0xff000000),
  translucentBlack: hex(0xdd000000),
  boxBorder: [hex(0x40ffeedd), hex(0x20ffeedd)] as [Argb, Argb], // PonderUI.COLOR_IDLE
  buttonBorder: [hex(0x60c0c0ff), hex(0x30c0c0ff)] as [Argb, Argb], // PonderButton.COLOR_IDLE
  textWindowBorder: [hex(0x607a6000), hex(0x207a6000)] as [Argb, Argb], // TextWindowElement.COLOR_WINDOW_BORDER
  progressBar: [hex(0x80aaaadd), hex(0x50aaaadd)] as [Argb, Argb], // PonderProgressBar.BAR_COLORS
  keyframe: hex(0x70ffffff), // PonderUI.COLOR_HOVER（#70FFFFFF → #30FFFFFF）两头都 setAlpha(112)
  drawStreak: hex(0xff101010), // UIRenderHelper.COLOR_STREAK（new Color(0x101010)，没带透明度 = 不透明）
  text: hex(0xffeeeeee), // UIRenderHelper.COLOR_TEXT
  grayText: hex(0xffa3a3a3), // UIRenderHelper.COLOR_TEXT_DARKER
};
// PonderPalette（说明框和描框的颜色）
export const ponderPalette = {
  WHITE: 0xeeeeee,
  RED: 0xff5d6c,
  GREEN: 0x8cba51,
  BLUE: 0x5f6caf,
  INPUT: 0x7fcde0,
  OUTPUT: 0xddc166,
} as const;
export type PaletteName = keyof typeof ponderPalette;
export const paletteValue = (p: PaletteName) => ponderPalette[p];
// 说明框的字色 = 调色和 #FFFFDD 各半（TextWindowElement：palette.mixWith(new Color(-35), 0.5)）
const textColorFor = (paletteName: PaletteName): Argb => {
  const rgbInt = ponderPalette[paletteName];
  return [255, Math.round((((rgbInt >> 16) & 255) + 255) / 2), Math.round((((rgbInt >> 8) & 255) + 255) / 2), Math.round(((rgbInt & 255) + 221) / 2)];
};

const css = (c: Argb, a = 1) => `rgba(${c[1]},${c[2]},${c[3]},${((c[0] / 255) * a).toFixed(4)})`;
const uiScale = ponderScreen.s;
const rect = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: Argb, alpha = 1) => {
  ctx.fillStyle = css(color, alpha);
  ctx.fillRect(Math.round(x0 * uiScale), Math.round(y0 * uiScale), Math.round(x1 * uiScale) - Math.round(x0 * uiScale), Math.round(y1 * uiScale) - Math.round(y0 * uiScale));
};
const grad = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, top: Argb, bot: Argb, alpha = 1) => {
  const gradient = ctx.createLinearGradient(0, y0 * uiScale, 0, y1 * uiScale);
  gradient.addColorStop(0, css(top, alpha));
  gradient.addColorStop(1, css(bot, alpha));
  ctx.fillStyle = gradient;
  ctx.fillRect(Math.round(x0 * uiScale), Math.round(y0 * uiScale), Math.round(x1 * uiScale) - Math.round(x0 * uiScale), Math.round(y1 * uiScale) - Math.round(y0 * uiScale));
};

// BoxElement（borderOffset 2）：内容区 (x, y, w, h)
export const drawBox = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, bgColor: Argb, borderColors: [Argb, Argb], alpha = 1) => {
  const left = x - 3, top = y - 3, right = x + width + 3, bottom = y + height + 3;
  rect(ctx, left, top - 1, right, top, bgColor, alpha);
  rect(ctx, left, bottom, right, bottom + 1, bgColor, alpha);
  rect(ctx, left - 1, top, left, bottom, bgColor, alpha);
  rect(ctx, right, top, right + 1, bottom, bgColor, alpha);
  rect(ctx, left, top, right, bottom, bgColor, alpha);
  // 边框：最外圈 1 像素，左右两条上下渐变
  rect(ctx, left, top, right, top + 1, borderColors[0], alpha);
  rect(ctx, left, bottom - 1, right, bottom, borderColors[1], alpha);
  grad(ctx, left, top + 1, left + 1, bottom - 1, borderColors[0], borderColors[1], alpha);
  grad(ctx, right - 1, top + 1, right, bottom - 1, borderColors[0], borderColors[1], alpha);
};

// 横的暗带（UIRenderHelper.streak）：从 x 往右（左 = false）或往左长 len，竖直方向从 y0 到 y1
const drawStreak = (ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, len: number, leftward: boolean) => {
  if (len <= 0) return;
  const streakColor = ponderColors.drawStreak;
  const gradient = ctx.createLinearGradient(x * uiScale, 0, (leftward ? x - len : x + len) * uiScale, 0);
  gradient.addColorStop(0, css(streakColor, 0.625));
  gradient.addColorStop(0.5, css(streakColor, 0.5));
  gradient.addColorStop(0.75, css(streakColor, 0.0625));
  gradient.addColorStop(1, css(streakColor, 0));
  ctx.fillStyle = gradient;
  const startX = leftward ? x - len : x;
  ctx.fillRect(Math.round(startX * uiScale), Math.round(y0 * uiScale), Math.round(len * uiScale), Math.round((y1 - y0) * uiScale));
};

// ---------- 控件图标 ----------
let widgetsCanvas: HTMLCanvasElement | null = null;
const getWidgetsCanvas = () => {
  if (widgetsCanvas) return widgetsCanvas;
  const widgetsTex = png(widgetsPng);
  const canvas = document.createElement('canvas');
  canvas.width = widgetsTex.w;
  canvas.height = widgetsTex.h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(widgetsTex.w, widgetsTex.h);
  img.data.set(widgetsTex.px);
  ctx.putImageData(img, 0, 0);
  widgetsCanvas = canvas;
  return canvas;
};
export const buttonIcons = { left: [0, 2], close: [1, 2], right: [2, 2], name: [3, 2], replay: [4, 2], comfyRead: [6, 2] } as const;
const drawButton = (ctx: CanvasRenderingContext2D, x: number, y: number, icon: readonly [number, number], alpha: number) => {
  drawBox(ctx, x, y, 20, 20, ponderColors.translucentBlack, ponderColors.buttonBorder, alpha);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(getWidgetsCanvas(), icon[0] * 16, icon[1] * 16, 16, 16, (x + 2) * uiScale, (y + 2) * uiScale, 16 * uiScale, 16 * uiScale);
  ctx.restore();
};

// ---------- 整个界面 ----------
export type 说明框 = {
  字: string;
  ponderPalette: PaletteName;
  点: [number, number] | null; // 被指的点（界面像素）；null = 不指东西（照 TextWindowElement：画面中间偏上，y 用 高度）
  高度?: number; // 不指东西时的 y（TextWindowElement 的 y 参数）
  nearTarget?: boolean; // placeNearTarget：框不离被指的点太远（x 不超过点 + 50）
  fade: number; // 0～1
};
export type PonderState = {
  visibility: number; // 整个界面淡入淡出（PonderUI.fadeIn）
  title: string;
  progressBar: number; // 0～1
  keyframes: number[]; // 0～1
  textWindows: 说明框[];
};
const { W: uiWidth, H: uiHeight } = ponderScreen;

// 底（世界画面上盖的暗色）
export const drawBackground = (ctx: CanvasRenderingContext2D, a: number) => grad(ctx, 0, 0, uiWidth, uiHeight, ponderColors.bgTop, ponderColors.bgBottom, a);

// 左上角的标题和物品框（物品本身另画，见 物品框位置）
export const itemFramePos = { x: 55 - 35, y: 19 + 1, size: 32 }; // GuiGameElement.of(物品).scale(2).at(-35, 1)
export const drawTitle = (ctx: CanvasRenderingContext2D, title: string, alpha: number) => {
  const titleWidth = Math.min(textWidth(title), 180);
  const lines = wrapText(title, 180);
  const streakHeight = 26 + lines.length * lineHeight;
  const ox = 55, oy = 19;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawStreak(ctx, ox, oy, oy + streakHeight, 70 + titleWidth, false);
  drawStreak(ctx, ox, oy, oy + streakHeight, 30, true);
  ctx.restore();
  drawBox(ctx, ox - 34, oy + 2, 30, 30, ponderColors.black, ponderColors.boxBorder, alpha);
  drawText(ctx, '思索……', ox + 4, oy + 6, css(ponderColors.grayText, alpha), uiScale);
  lines.forEach((l, i) => drawText(ctx, l, ox + 4, oy + 6 + 14 + i * lineHeight, css(ponderColors.text, alpha), uiScale));
};

export const drawButtons = (ctx: CanvasRenderingContext2D, alpha: number) => {
  const y = uiHeight - 20 - 31;
  let x = Math.floor((uiWidth - 20) / 2) - (70 + 2 * 8);
  drawButton(ctx, x, y, buttonIcons.name, alpha);
  drawButton(ctx, uiWidth - 20 - 31, y, buttonIcons.comfyRead, alpha);
  x += 50 + 8;
  drawButton(ctx, x, y, buttonIcons.left, alpha);
  x += 20 + 8;
  drawButton(ctx, x, y, buttonIcons.close, alpha);
  x += 20 + 8;
  drawButton(ctx, x, y, buttonIcons.right, alpha);
  x += 50 + 8;
  drawButton(ctx, x, y, buttonIcons.replay, alpha);
};

export const drawProgressBar = (ctx: CanvasRenderingContext2D, progress: number, keyframes: number[], alpha: number) => {
  const x = Math.floor(uiWidth / 2) - 110; // 整数除法：427 宽时 x = 103、宽 = 427 − 2x = 221
  const y = uiHeight - 20 - 31 + 20 + 4;
  const barWidth = uiWidth - 2 * x;
  drawBox(ctx, x, y, barWidth, 1, ponderColors.black, ponderColors.boxBorder, alpha);
  const len = (barWidth + 4) * Math.min(1, Math.max(0, progress));
  rect(ctx, x - 2, y - 1, x - 2 + len, y + 1, ponderColors.progressBar[0], alpha);
  rect(ctx, x - 2, y + 1, x - 2 + len, y + 2, ponderColors.progressBar[1], alpha);
  for (const k of keyframes) {
    const kx = x - 2 + Math.floor(k * (barWidth + 2));
    rect(ctx, kx, y - 2, kx + 2, y + 3, ponderColors.keyframe, alpha);
  }
};

// 说明框：照 TextWindowElement.render
export const drawTextWindow = (ctx: CanvasRenderingContext2D, textWindow: 说明框, alpha: number) => {
  if (textWindow.fade < 0.0625) return;
  const anchor: [number, number] = textWindow.点 ?? [uiWidth / 2, (uiHeight - 200) / 2 + (textWindow.高度 ?? 0) - 8];
  const distFromMid = (uiHeight / 2 - anchor[1] - 10) / 100;
  let tx = uiWidth * (0.75 + distFromMid * distFromMid * (0.625 - 0.75));
  if (textWindow.nearTarget && textWindow.点) tx = Math.min(tx, anchor[0] + 50);
  tx = Math.floor(tx);
  const tw = Math.floor(Math.min(uiWidth - tx, 180));
  const lines = wrapText(textWindow.字, tw);
  const bw = Math.max(...lines.map(textWidth));
  const bh = lines.length * lineHeight - 1;
  const y = Math.floor(anchor[1]);
  drawBox(ctx, tx - 10, y + 3, bw, bh, ponderColors.black, ponderColors.textWindowBorder, alpha);
  const textColor = textColorFor(textWindow.ponderPalette);
  if (textWindow.点) {
    const x1 = anchor[0] + (tx - anchor[0]) * textWindow.fade;
    rect(ctx, Math.min(anchor[0], x1), y, Math.max(anchor[0], x1), y + 1, textColor, alpha);
    grad(ctx, Math.min(anchor[0], x1), y + 1, Math.max(anchor[0], x1), y + 2, [255, 0x49, 0x49, 0x49], [255, 0x39, 0x39, 0x39], alpha);
  }
  const textAlpha = Math.max(5 / 255, Math.min(1, textWindow.fade));
  lines.forEach((l, i) => drawText(ctx, l, tx - 10, y + 3 + lineHeight * i, css(textColor, textAlpha * alpha), uiScale));
};
