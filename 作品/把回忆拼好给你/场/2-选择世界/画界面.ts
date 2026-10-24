// 原版「选择世界」界面的画法：先在一张底稿上按原版的画序画整块界面（一个界面像素 2 个底稿像素：图标像素、汉字的点、光标像素都是半个界面像素，全落在整像素上），
// 再按 取景（界面像素的中心点 + 尺）不插值地放大贴到成片分辨率的 2D 画布上。尺 12 时一个底稿像素正好 6 个成片像素；钻进图标时 尺 不是整数，按最近邻取。
// 画序照原版：列表底（泥土 × 0.125）→ 选中框 → 存档那一项（三行字、图标、指着时的蒙灰和播放箭头）→ 上下两条泥土（× 0.25）→ 列表上下沿的黑渐变 → 搜索框 → 系统光标。
// 钻进图标时图标里透掉的照片像素清成透明，段把新世界垫在这张画布下面，就从图标里露出来。坐标、颜色都在 参数.ts。
import { png, type Png } from '@engine/model/贴图.ts';
import 泥土uri from 'asset:贴图/界面/选项背景';
import 箭头uri from 'asset:贴图/界面/世界选择';
import { 图标边 } from '../../界面/实例图标.ts';
import { 选择世界字 } from '../../界面/选择世界字.ts';
import { 界面, 色 } from './参数.ts';
import { 行字 } from './编排.ts';

export type 取景 = { 中心: { x: number; y: number }; 尺: number };

export type 界面状态 = {
  取景: 取景;
  /** 0 没指着、1 指着那一项的字、2 指着图标（编排.ts 的 指着在） */
  指着: 0 | 1 | 2;
  /** 选中了那一项（选中框；搜索框没了焦点） */
  选中: boolean;
  /** 搜索框里的「_」这一帧亮不亮（没焦点时不画） */
  框光标: boolean;
  /** 鼠标光标的箭头尖（界面像素，到半个），null = 不画 */
  光标: { x: number; y: number } | null;
  /** 存档图标：图标边×图标边 的 RGBA（实例图标.ts 做的） */
  图标: Uint8Array;
  /** 图标里哪些照片像素已经透掉（钻进图标时露出后面的新世界）：透掉的清成透明 */
  图标透?: (i: number, j: number) => boolean;
  /** 图标往外扩几个界面像素（片尾回色时弹一下） */
  图标弹?: number;
  /** 存档那一项的三行字，不给 = 第 0 镜的（编排.ts 的 行字；片尾回色起换成 重逢行字） */
  行字?: readonly string[];
};

/** 底稿一个界面像素几个像素 */
const 倍 = 2;
const 稿宽 = 界面.宽 * 倍, 稿高 = 界面.高 * 倍;

const 新画布 = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// ---------- 泥土底（不随帧变，建一次） ----------
let 泥土底: HTMLCanvasElement | null = null;
/** 原版 blit 的平铺：16×16 的贴图按 32×32 界面像素一块铺（一个贴图像素 2 界面像素），带的颜色乘进去；列表区 uOffset = x1（界面宽）、vOffset = y1，
 *  上下两条 uOffset 0、vOffset 和屏幕 y 一样 */
const 画泥土底 = (): HTMLCanvasElement => {
  if (泥土底) return 泥土底;
  const 泥: Png = png(泥土uri);
  const 小 = 新画布(界面.宽, 界面.高);
  const ctx = 小.getContext('2d')!;
  const img = ctx.createImageData(界面.宽, 界面.高);
  for (let y = 0; y < 界面.高; y++)
    for (let x = 0; x < 界面.宽; x++) {
      const 列表 = y >= 界面.列表.上 && y < 界面.列表.下;
      const u = 列表 ? x + 界面.宽 : x;
      const v = 列表 ? y - 界面.列表.上 + 界面.列表.下 : y;
      const o = ((Math.floor((((v % 32) + 32) % 32) / 2) * 泥.w + Math.floor((((u % 32) + 32) % 32) / 2)) * 4);
      const k = 列表 ? 色.列表乘 : 色.带乘;
      const p = (y * 界面.宽 + x) * 4;
      for (let c = 0; c < 3; c++) img.data[p + c] = Math.round(泥.px[o + c]! * k);
      img.data[p + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  泥土底 = 新画布(稿宽, 稿高);
  const b = 泥土底.getContext('2d')!;
  b.imageSmoothingEnabled = false;
  b.drawImage(小, 0, 0, 稿宽, 稿高);
  return 泥土底;
};

let 箭头图: HTMLCanvasElement | null = null;
/** world_selection.png 整张（256×256，播放箭头在 u 0 的 v 0、v 32 两格） */
const 取箭头图 = () => {
  if (箭头图) return 箭头图;
  const 图 = png(箭头uri);
  箭头图 = 新画布(图.w, 图.h);
  const ctx = 箭头图.getContext('2d')!;
  const img = ctx.createImageData(图.w, 图.h);
  img.data.set(图.px);
  ctx.putImageData(img, 0, 0);
  return 箭头图;
};

// ---------- 每帧的底稿 ----------
let 稿: HTMLCanvasElement | null = null;
let 图标稿: HTMLCanvasElement | null = null;

/** 界面像素的矩形（左上 x0, y0，右下 x1, y1，可以到半个界面像素）填色 */
const 填 = (ctx: CanvasRenderingContext2D, 色值: string, x0: number, y0: number, x1: number, y1: number) => {
  ctx.fillStyle = 色值;
  ctx.fillRect(x0 * 倍, y0 * 倍, (x1 - x0) * 倍, (y1 - y0) * 倍);
};

/** 鼠标箭头（经典的白芯黑边箭头，12×19 个光标像素，尖在左上角）。X 黑边、W 白芯 */
const 箭头 = [
  'X', 'XX', 'XWX', 'XWWX', 'XWWWX', 'XWWWWX', 'XWWWWWX', 'XWWWWWWX', 'XWWWWWWWX', 'XWWWWWWWWX', 'XWWWWWWWWWX', 'XWWWWWWXXXXX',
  'XWWWXWWX', 'XWWX XWWX', 'XWX  XWWX', 'XX    XWWX', 'X     XWWX', '       XWWX', '        XX',
];

/** 列表上下沿的 4 界面像素黑渐变（fillGradient：上沿从不透明到透明，下沿反过来），按底稿每一行的中心取不透明度 */
const 画渐变 = (ctx: CanvasRenderingContext2D) => {
  const n = 4 * 倍;
  for (let r = 0; r < n; r++) {
    const a = 1 - (r + 0.5) / n;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 界面.列表.上 * 倍 + r, 稿宽, 1);
    ctx.fillRect(0, 界面.列表.下 * 倍 - 1 - r, 稿宽, 1);
  }
};

const 画底稿 = (s: 界面状态): HTMLCanvasElement => {
  稿 ??= 新画布(稿宽, 稿高);
  const ctx = 稿.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 稿宽, 稿高);
  ctx.drawImage(画泥土底(), 0, 0);
  const { 行 } = 界面;
  if (s.选中) {
    const b = 界面.选中框;
    填(ctx, 色.选中外, b.左, b.上, b.右, b.下);
    填(ctx, 色.选中里, b.左 + 1, b.上 + 1, b.右 - 1, b.下 - 1);
  }
  (s.行字 ?? 行字).forEach((字, k) => 选择世界字.画(ctx, 字, { x: 0, y: 0 }, 界面.字x, 界面.字y[k]!, k === 0 ? 色.名 : 色.灰字, 倍));
  // 图标：64×64 的照片画进 32×32 界面像素（一个照片像素一个底稿像素），透掉的像素清成透明
  图标稿 ??= 新画布(图标边, 图标边);
  const ictx = 图标稿.getContext('2d')!;
  const img = ictx.createImageData(图标边, 图标边);
  img.data.set(s.图标);
  if (s.图标透) for (let j = 0; j < 图标边; j++) for (let i = 0; i < 图标边; i++) if (s.图标透(i, j)) img.data[(j * 图标边 + i) * 4 + 3] = 0;
  ictx.putImageData(img, 0, 0);
  const 弹 = s.图标弹 ?? 0;
  const 边 = 界面.图标边;
  ctx.clearRect((行.左 - 弹) * 倍, (行.顶 - 弹) * 倍, (边 + 2 * 弹) * 倍, (边 + 2 * 弹) * 倍);
  ctx.drawImage(图标稿, (行.左 - 弹) * 倍, (行.顶 - 弹) * 倍, (边 + 2 * 弹) * 倍, (边 + 2 * 弹) * 倍);
  if (s.指着) {
    填(ctx, 色.指着蒙, 行.左, 行.顶, 行.左 + 边, 行.顶 + 边);
    ctx.drawImage(取箭头图(), 0, s.指着 === 2 ? 32 : 0, 32, 32, 行.左 * 倍, 行.顶 * 倍, 边 * 倍, 边 * 倍);
  }
  画渐变(ctx);
  const f = 界面.搜索框;
  填(ctx, s.选中 ? 色.框边 : 色.框边焦点, f.x - 1, f.y - 1, f.x + f.宽 + 1, f.y + f.高 + 1);
  填(ctx, 色.框底, f.x, f.y, f.x + f.宽, f.y + f.高);
  if (!s.选中 && s.框光标) 选择世界字.画(ctx, '_', { x: 0, y: 0 }, f.x + 4, f.y + (f.高 - 8) / 2, 色.框字, 倍, { 阴影: true });
  if (s.光标) {
    const u = Math.round(s.光标.x * 倍), v = Math.round(s.光标.y * 倍);
    箭头.forEach((行文, j) => {
      for (let i = 0; i < 行文.length; i++) {
        const c = 行文[i];
        if (c !== 'X' && c !== 'W') continue;
        ctx.fillStyle = c === 'X' ? 色.光标边 : 色.光标;
        ctx.fillRect(u + i, v + j, 1, 1);
      }
    });
  }
  return 稿;
};

/** 画整张界面（先清画布）：底稿按取景不插值地放大，只贴画面里看得见的那一截 */
export const 画选择世界 = (ctx: CanvasRenderingContext2D, 宽: number, 高: number, s: 界面状态) => {
  const 底 = 画底稿(s);
  ctx.clearRect(0, 0, 宽, 高);
  const { 中心, 尺 } = s.取景;
  // 看得见的底稿范围（底稿像素，取整往外扩一格），再投回画布
  const sx0 = Math.max(0, Math.floor((中心.x - 宽 / 2 / 尺) * 倍) - 1), sx1 = Math.min(稿宽, Math.ceil((中心.x + 宽 / 2 / 尺) * 倍) + 1);
  const sy0 = Math.max(0, Math.floor((中心.y - 高 / 2 / 尺) * 倍) - 1), sy1 = Math.min(稿高, Math.ceil((中心.y + 高 / 2 / 尺) * 倍) + 1);
  if (sx1 <= sx0 || sy1 <= sy0) return;
  const 投x = (px: number) => Math.round(宽 / 2 + (px / 倍 - 中心.x) * 尺);
  const 投y = (py: number) => Math.round(高 / 2 + (py / 倍 - 中心.y) * 尺);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(底, sx0, sy0, sx1 - sx0, sy1 - sy0, 投x(sx0), 投y(sy0), 投x(sx1) - 投x(sx0), 投y(sy1) - 投y(sy0));
};

/** 界面像素 → 成片像素（画布左上角原点），片尾碎片层用 */
export const 投 = (t: 取景, 宽: number, 高: number) => ({
  x: (u: number) => Math.round(宽 / 2 + (u - t.中心.x) * t.尺),
  y: (v: number) => Math.round(高 / 2 + (v - t.中心.y) * t.尺),
});
