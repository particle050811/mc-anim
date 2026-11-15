// 原版「选择世界」界面的画法：先在一张底稿上按原版的画序画整块界面（一个界面像素 2 个底稿像素：图标像素、汉字的点、光标像素都是半个界面像素，全落在整像素上），
// 再按 取景（界面像素的中心点 + 尺）不插值地放大贴到成片分辨率的 2D 画布上。尺 12 时一个底稿像素正好 6 个成片像素；钻进图标时 尺 不是整数，按最近邻取。
// 画序照原版：列表底（泥土 × 0.125）→ 选中框 → 存档那一项（三行字、图标、指着时的蒙灰和播放箭头）→ 上下两条泥土（× 0.25）→ 列表上下沿的黑渐变 → 搜索框 → 系统光标。
// 钻进图标时图标里透掉的照片像素清成透明，段把新世界垫在这张画布下面，就从图标里露出来。坐标、颜色都在 参数.ts。
import { png, type Png } from '@engine/model/贴图.ts';
import dirtBgPng from 'asset:贴图/界面/选项背景';
import arrowPng from 'asset:贴图/界面/世界选择';
import { iconEdge } from '../../界面/实例图标.ts';
import { selectWorldFont } from '../../界面/选择世界字.ts';
import { ui, colorPalette } from './参数.ts';
import { rowTexts } from './编排.ts';

export type Framing = { 中心: { x: number; y: number }; unit: number };

export type UiState = {
  framing: Framing;
  /** 0 没指着、1 指着那一项的字、2 指着图标（编排.ts 的 指着在） */
  pointAt: 0 | 1 | 2;
  /** 选中了那一项（选中框；搜索框没了焦点） */
  selected: boolean;
  /** 搜索框里的「_」这一帧亮不亮（没焦点时不画） */
  frameCursor: boolean;
  /** 鼠标光标的箭头尖（界面像素，到半个），null = 不画 */
  cursor: { x: number; y: number } | null;
  /** 存档图标：图标边×图标边 的 RGBA（实例图标.ts 做的） */
  iconMap: Uint8Array;
  /** 图标里哪些照片像素已经透掉（钻进图标时露出后面的新世界）：透掉的清成透明 */
  iconSeeThrough?: (i: number, j: number) => boolean;
  /** 图标往外扩几个界面像素（片尾回色时弹一下） */
  iconBounce?: number;
  /** 存档那一项的三行字，不给 = 第 0 镜的（编排.ts 的 行字；片尾回色起换成 重逢行字） */
  rowTexts?: readonly string[];
};

/** 底稿一个界面像素几个像素 */
const draftScale = 2;
const draftWidth = ui.宽 * draftScale, draftHeight = ui.高 * draftScale;

const newCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// ---------- 泥土底（不随帧变，建一次） ----------
let dirtBase: HTMLCanvasElement | null = null;
/** 原版 blit 的平铺：16×16 的贴图按 32×32 界面像素一块铺（一个贴图像素 2 界面像素），带的颜色乘进去；列表区 uOffset = x1（界面宽）、vOffset = y1，
 *  上下两条 uOffset 0、vOffset 和屏幕 y 一样。材质包的 32×32 泥土照样铺 32×32 界面像素（一个贴图像素 1 界面像素） */
const drawDirtBase = (): HTMLCanvasElement => {
  if (dirtBase) return dirtBase;
  const dirtTile: Png = png(dirtBgPng);
  const small = newCanvas(ui.宽, ui.高);
  const ctx = small.getContext('2d')!;
  const img = ctx.createImageData(ui.宽, ui.高);
  for (let y = 0; y < ui.高; y++)
    for (let x = 0; x < ui.宽; x++) {
      const inList = y >= ui.listRange.上 && y < ui.listRange.下;
      const u = inList ? x + ui.宽 : x;
      const v = inList ? y - ui.listRange.上 + ui.listRange.下 : y;
      const o = ((Math.floor(((((v % 32) + 32) % 32) * dirtTile.h) / 32) * dirtTile.w + Math.floor(((((u % 32) + 32) % 32) * dirtTile.w) / 32)) * 4);
      const k = inList ? colorPalette.listMul : colorPalette.bandMul;
      const p = (y * ui.宽 + x) * 4;
      for (let c = 0; c < 3; c++) img.data[p + c] = Math.round(dirtTile.px[o + c]! * k);
      img.data[p + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  dirtBase = newCanvas(draftWidth, draftHeight);
  const b = dirtBase.getContext('2d')!;
  b.imageSmoothingEnabled = false;
  b.drawImage(small, 0, 0, draftWidth, draftHeight);
  return dirtBase;
};

let arrowCanvas: HTMLCanvasElement | null = null;
/** world_selection.png 整张（256×256，播放箭头在 u 0 的 v 0、v 32 两格；材质包的高清版是它的整数倍，取的时候按 箭头倍 放大坐标） */
const getArrowCanvas = () => {
  if (arrowCanvas) return arrowCanvas;
  const arrowImg = png(arrowPng);
  arrowCanvas = newCanvas(arrowImg.w, arrowImg.h);
  const ctx = arrowCanvas.getContext('2d')!;
  const img = ctx.createImageData(arrowImg.w, arrowImg.h);
  img.data.set(arrowImg.px);
  ctx.putImageData(img, 0, 0);
  return arrowCanvas;
};

// ---------- 每帧的底稿 ----------
let canvas: HTMLCanvasElement | null = null;
let iconDraft: HTMLCanvasElement | null = null;

/** 界面像素的矩形（左上 x0, y0，右下 x1, y1，可以到半个界面像素）填色 */
const fillBox = (ctx: CanvasRenderingContext2D, colorValue: string, x0: number, y0: number, x1: number, y1: number) => {
  ctx.fillStyle = colorValue;
  ctx.fillRect(x0 * draftScale, y0 * draftScale, (x1 - x0) * draftScale, (y1 - y0) * draftScale);
};

/** 鼠标箭头（经典的白芯黑边箭头，12×19 个光标像素，尖在左上角）。X 黑边、W 白芯 */
const arrowRows = [
  'X', 'XX', 'XWX', 'XWWX', 'XWWWX', 'XWWWWX', 'XWWWWWX', 'XWWWWWWX', 'XWWWWWWWX', 'XWWWWWWWWX', 'XWWWWWWWWWX', 'XWWWWWWXXXXX',
  'XWWWXWWX', 'XWWX XWWX', 'XWX  XWWX', 'XX    XWWX', 'X     XWWX', '       XWWX', '        XX',
];

/** 列表上下沿的 4 界面像素黑渐变（fillGradient：上沿从不透明到透明，下沿反过来），按底稿每一行的中心取不透明度 */
const drawGradient = (ctx: CanvasRenderingContext2D) => {
  const n = 4 * draftScale;
  for (let r = 0; r < n; r++) {
    const a = 1 - (r + 0.5) / n;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, ui.listRange.上 * draftScale + r, draftWidth, 1);
    ctx.fillRect(0, ui.listRange.下 * draftScale - 1 - r, draftWidth, 1);
  }
};

const drawBaseDraft = (s: UiState): HTMLCanvasElement => {
  canvas ??= newCanvas(draftWidth, draftHeight);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, draftWidth, draftHeight);
  ctx.drawImage(drawDirtBase(), 0, 0);
  const { 行: rowPos } = ui;
  if (s.selected) {
    const b = ui.selectedFrame;
    fillBox(ctx, colorPalette.selectedOuter, b.left, b.上, b.right, b.下);
    fillBox(ctx, colorPalette.selectedInner, b.left + 1, b.上 + 1, b.right - 1, b.下 - 1);
  }
  (s.rowTexts ?? rowTexts).forEach((lineText, k) => selectWorldFont.draw(ctx, lineText, { x: 0, y: 0 }, ui.textX, ui.textY[k]!, k === 0 ? colorPalette.名 : colorPalette.greyText, draftScale));
  // 图标：64×64 的照片画进 32×32 界面像素（一个照片像素一个底稿像素），透掉的像素清成透明
  iconDraft ??= newCanvas(iconEdge, iconEdge);
  const ictx = iconDraft.getContext('2d')!;
  const img = ictx.createImageData(iconEdge, iconEdge);
  img.data.set(s.iconMap);
  if (s.iconSeeThrough) for (let j = 0; j < iconEdge; j++) for (let i = 0; i < iconEdge; i++) if (s.iconSeeThrough(i, j)) img.data[(j * iconEdge + i) * 4 + 3] = 0;
  ictx.putImageData(img, 0, 0);
  const margin = s.iconBounce ?? 0;
  const side = ui.iconEdge;
  ctx.clearRect((rowPos.left - margin) * draftScale, (rowPos.topY - margin) * draftScale, (side + 2 * margin) * draftScale, (side + 2 * margin) * draftScale);
  ctx.drawImage(iconDraft, (rowPos.left - margin) * draftScale, (rowPos.topY - margin) * draftScale, (side + 2 * margin) * draftScale, (side + 2 * margin) * draftScale);
  if (s.pointAt) {
    fillBox(ctx, colorPalette.pointingDim, rowPos.left, rowPos.topY, rowPos.left + side, rowPos.topY + side);
    const arrowScale = getArrowCanvas().width / 256;
    ctx.drawImage(getArrowCanvas(), 0, (s.pointAt === 2 ? 32 : 0) * arrowScale, 32 * arrowScale, 32 * arrowScale, rowPos.left * draftScale, rowPos.topY * draftScale, side * draftScale, side * draftScale);
  }
  drawGradient(ctx);
  const f = ui.searchFrame;
  fillBox(ctx, s.selected ? colorPalette.frameEdge : colorPalette.frameEdgeFocus, f.x - 1, f.y - 1, f.x + f.宽 + 1, f.y + f.高 + 1);
  fillBox(ctx, colorPalette.boxBackground, f.x, f.y, f.x + f.宽, f.y + f.高);
  if (!s.selected && s.frameCursor) selectWorldFont.draw(ctx, '_', { x: 0, y: 0 }, f.x + 4, f.y + (f.高 - 8) / 2, colorPalette.frameText, draftScale, { shadow: true });
  if (s.cursor) {
    const u = Math.round(s.cursor.x * draftScale), v = Math.round(s.cursor.y * draftScale);
    arrowRows.forEach((arrowRow, j) => {
      for (let i = 0; i < arrowRow.length; i++) {
        const c = arrowRow[i];
        if (c !== 'X' && c !== 'W') continue;
        ctx.fillStyle = c === 'X' ? colorPalette.cursorEdge : colorPalette.cursorColor;
        ctx.fillRect(u + i, v + j, 1, 1);
      }
    });
  }
  return canvas;
};

/** 画整张界面（先清画布）：底稿按取景不插值地放大，只贴画面里看得见的那一截 */
export const drawSelectWorld = (ctx: CanvasRenderingContext2D, width: number, height: number, s: UiState) => {
  const bottomCanvas = drawBaseDraft(s);
  ctx.clearRect(0, 0, width, height);
  const { 中心: center, unit } = s.framing;
  // 看得见的底稿范围（底稿像素，取整往外扩一格），再投回画布
  const sx0 = Math.max(0, Math.floor((center.x - width / 2 / unit) * draftScale) - 1), sx1 = Math.min(draftWidth, Math.ceil((center.x + width / 2 / unit) * draftScale) + 1);
  const sy0 = Math.max(0, Math.floor((center.y - height / 2 / unit) * draftScale) - 1), sy1 = Math.min(draftHeight, Math.ceil((center.y + height / 2 / unit) * draftScale) + 1);
  if (sx1 <= sx0 || sy1 <= sy0) return;
  const projectX = (px: number) => Math.round(width / 2 + (px / draftScale - center.x) * unit);
  const projectY = (py: number) => Math.round(height / 2 + (py / draftScale - center.y) * unit);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bottomCanvas, sx0, sy0, sx1 - sx0, sy1 - sy0, projectX(sx0), projectY(sy0), projectX(sx1) - projectX(sx0), projectY(sy1) - projectY(sy0));
};

/** 界面像素 → 成片像素（画布左上角原点），片尾碎片层用 */
export const project = (t: Framing, width: number, height: number) => ({
  x: (u: number) => Math.round(width / 2 + (u - t.中心.x) * t.unit),
  y: (v: number) => Math.round(height / 2 + (v - t.中心.y) * t.unit),
});
