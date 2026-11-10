// 径向轮盘画在 2D 画布上：扇形带、像素图标、背景贴图、文字格，和照 GenericRadialMenu.draw() 拼起来的原版一圈轮盘（数和出处见 径向轮盘数.ts）。
// 屏幕上用（径向轮盘.tsx）和贴到世界里的面上用（径向轮盘世界.tsx）是同一套画法。
// 和游戏不一样的只有一处：画布的扇形带边缘带抗锯齿，游戏里没有多重采样、边是锯齿的。同色相邻的格并成一条路径画，中间不会有缝；
// 不同色相邻（悬停格和两边）的交界上有一条比两边略淡的发丝线（两次半覆盖叠出来的），4K 下看不出。
import type { Png } from '@engine/model/贴图.ts';
import { drawText, textWidth } from './像素字.ts';
import { argb色, 图标左上, 径向轮盘数, 格范围, 轮盘态 } from './径向轮盘数.ts';

/** 画到哪：心 = 圆心在画布上的像素坐标，倍 = 一个 GUI 像素是几个画布像素（屏幕上 = GUI 缩放 × devicePixelRatio） */
export type 画布位 = { ctx: CanvasRenderingContext2D; 心x: number; 心y: number; 倍: number };

export type 带段 = { 起: number; 止: number; 色: string };

const 整圈 = Math.PI * 2;

/** 一圈扇形带：段按角度顺序给，首尾相接；同色相邻的并成一条路径 */
export const 画环带 = ({ ctx, 心x, 心y, 倍 }: 画布位, 内: number, 外: number, 段们: readonly 带段[]) => {
  if (外 <= 内 || 段们.length === 0) return;
  const 并: 带段[] = [];
  for (const 段 of 段们) {
    const 上 = 并[并.length - 1];
    if (上 && 上.色 === 段.色 && Math.abs(上.止 - 段.起) < 1e-6) 上.止 = 段.止;
    else 并.push({ ...段 });
  }
  if (并.length > 1) {
    const 首 = 并[0]!;
    const 尾 = 并[并.length - 1]!;
    if (首.色 === 尾.色 && Math.abs(尾.止 - 整圈 - 首.起) < 1e-6) {
      尾.止 += 首.止 - 首.起;
      并.shift();
    }
  }
  for (const 段 of 并) {
    ctx.fillStyle = 段.色;
    ctx.beginPath();
    if (段.止 - 段.起 >= 整圈 - 1e-6) {
      ctx.arc(心x, 心y, 外 * 倍, 0, 整圈);
      ctx.moveTo(心x + 内 * 倍, 心y);
      ctx.arc(心x, 心y, 内 * 倍, 0, 整圈);
      ctx.fill('evenodd');
    } else {
      ctx.arc(心x, 心y, 外 * 倍, 段.起, 段.止);
      ctx.arc(心x, 心y, 内 * 倍, 段.止, 段.起, true);
      ctx.closePath();
      ctx.fill();
    }
  }
};

// 贴图 → 小画布（按亮度各存一份），再最近邻放大画出去
const 小画布们 = new WeakMap<Png, Map<number, HTMLCanvasElement>>();
const 小画布 = (tex: Png, 亮度: number) => {
  let 表 = 小画布们.get(tex);
  if (!表) 小画布们.set(tex, (表 = new Map()));
  let cv = 表.get(亮度);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = tex.w;
    cv.height = tex.h;
    const ctx = cv.getContext('2d')!;
    const 图 = ctx.createImageData(tex.w, tex.h);
    for (let i = 0; i < tex.px.length; i += 4) {
      图.data[i] = Math.min(255, tex.px[i]! * 亮度);
      图.data[i + 1] = Math.min(255, tex.px[i + 1]! * 亮度);
      图.data[i + 2] = Math.min(255, tex.px[i + 2]! * 亮度);
      图.data[i + 3] = tex.px[i + 3]!;
    }
    ctx.putImageData(图, 0, 0);
    表.set(亮度, cv);
  }
  return cv;
};

/** 像素贴图最近邻画出去：左、上、宽、高是 GUI 像素（相对圆心），左上角对齐到画布像素。亮度乘在颜色上（1 = 原色） */
export const 画像素图 = ({ ctx, 心x, 心y, 倍 }: 画布位, tex: Png, 左: number, 上: number, 宽: number, 高: number, 选项: { 不透明度?: number; 亮度?: number } = {}) => {
  const w = Math.round(宽 * 倍);
  const h = Math.round(高 * 倍);
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 选项.不透明度 ?? 1;
  ctx.drawImage(小画布(tex, 选项.亮度 ?? 1), Math.round(心x + 左 * 倍), Math.round(心y + 上 * 倍), w, h);
  ctx.restore();
};

/** drawBg()：256×256 的背景贴图，50% 不透明，绕圆心缩放、整体上移 1 个 GUI 像素；游戏里 GUI 贴图是最近邻采样 */
export const 画底纹 = (位: 画布位, 底纹: Png, 缩放: number) => {
  const 边 = 径向轮盘数.底纹边 * 缩放;
  画像素图(位, 底纹, -边 / 2, -边 / 2 - 径向轮盘数.底纹上移, 边, 边, { 不透明度: 径向轮盘数.底纹不透明度 });
};

/** TextRadialMenuItem.draw()：游戏字体、不带阴影（drawString 最后一个参数 false），默认白色（color = -1）；
 *  x = (int)(x − 字宽 / 2)（字宽 / 2 是整数除法），y = (int)(y − 4)。字只有 像素字 资产里收了的才画得出 */
export const 画文字格 = ({ ctx, 心x, 心y, 倍 }: 画布位, 文字: string, 角: number, 半径: number, 色 = '#ffffff') => {
  const x = Math.floor(半径 * Math.cos(角)) - Math.floor(textWidth(文字) / 2);
  const y = Math.floor(半径 * Math.sin(角)) - 径向轮盘数.文字上移;
  ctx.save();
  ctx.translate(Math.round(心x), Math.round(心y));
  drawText(ctx, 文字, x, y, 色, 倍);
  ctx.restore();
};

/** 一格放什么：物品图标（ItemStackRadialMenuItem）或一行字（TextRadialMenuItem，聚晶轮盘的「聚晶包」「提取」两格） */
export type 轮盘格 = { 图标: Png } | { 文字: string };

export type 原版轮盘参数 = {
  格: readonly 轮盘格[];
  /** 打开后第几刻（可带小数）；2.5 刻以内是打开动画，只有背景和扇形带 */
  刻: number;
  /** 悬停的那一格（鼠标所在），不给就没有 */
  选中?: number;
  /** 圆心画的物品图标（聚晶轮盘是法杖里现在装的聚晶，没装就不画） */
  圆心?: Png | null;
  /** customBackground：聚晶轮盘是 textures/gui/focus_wheel.png */
  底纹?: Png | null;
};

/** 照 GenericRadialMenu.draw() 的顺序画一圈：背景 → 扇形带 → 各格图标或文字 → 圆心物品。
 *  打开动画里 draw() 给扇形带套了 translate(0, animTop)，但 drawSlices 直接往 Tesselator 写屏幕坐标、不经 GuiGraphics 的矩阵，所以扇形带始终在圆心，这里照这个实际效果画。
 *  没画的：悬停格的物品提示框（drawTooltips）、物品的数量和冷却遮罩（renderItemDecorations） */
export const 画原版轮盘 = (位: 画布位, { 格, 刻, 选中, 圆心, 底纹 }: 原版轮盘参数) => {
  const 态 = 轮盘态(刻);
  if (!态 || 格.length === 0) return;
  if (底纹) 画底纹(位, 底纹, 态.底纹缩放);
  const 悬停 = 态.动画中 ? -1 : (选中 ?? -1); // processMouse() 只在 isReady() 时算悬停
  画环带(
    位,
    态.内,
    态.外,
    格.map((_, i) => ({ ...格范围(i, 格.length), 色: argb色(i === 悬停 ? 径向轮盘数.悬停色 : 径向轮盘数.底色) })),
  );
  if (态.动画中) return;
  格.forEach((项, i) => {
    const { 中 } = 格范围(i, 格.length);
    if ('图标' in 项) {
      const [左, 上] = 图标左上(中, 态.图标半径);
      画像素图(位, 项.图标, 左, 上, 径向轮盘数.图标边, 径向轮盘数.图标边);
    } else 画文字格(位, 项.文字, 中, 态.图标半径);
  });
  // 圆心物品画在 ((width − 16) / 2, (height − 16) / 2)
  if (圆心) 画像素图(位, 圆心, -径向轮盘数.图标边 / 2, -径向轮盘数.图标边 / 2, 径向轮盘数.图标边, 径向轮盘数.图标边);
};
