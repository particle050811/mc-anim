// 启动器的画法：在一张成片分辨率的 2D 画布上，按 取景（界面像素的中心点 + 尺）画浅底、白卡片、版本列表、悬停底色、六月樱的方形图标和鼠标光标。
// 真 2D（05-画风「第 0 镜和片尾的 PCL」）；照全片的像素画法画成像素界面：平涂、1 界面像素的边、游戏像素字，界面像素的边落在整数成片像素上（尺 是整数时）。
// 钻进图标时 尺 不是整数，边按四舍五入落到成片像素上，不抗锯齿。坐标、颜色都在 参数.ts。
import { png, type Png } from '@engine/model/贴图.ts';
import { textureNames } from '@engine/voxel/真实方块表.ts';
import atlasUri from 'asset:贴图/场景/关键帧/方块表';
import { 图标边 } from '../../界面/实例图标.ts';
import { 启动器字 } from '../../界面/启动器字.ts';
import { 卡们, 布局, 歌词带底, 色 } from './参数.ts';
import { 卡排 } from './编排.ts';

export type 取景 = { 中心: { x: number; y: number }; 尺: number };

export type 启动器状态 = {
  取景: 取景;
  /** 六月樱那一行：0 平常、1 悬停、2 按下 */
  行态: 0 | 1 | 2;
  /** 鼠标光标的箭头尖（界面像素），null = 不画 */
  光标: { x: number; y: number } | null;
  /** 六月樱的图标：图标边×图标边 的 RGBA（实例图标.ts 做的） */
  图标: Uint8Array;
  /** 图标里哪些照片像素已经透掉（钻进图标时露出后面的新世界）：透掉的清成透明 */
  图标透?: (i: number, j: number) => boolean;
  /** 图标往外扩几个界面像素（片尾回色时弹一下） */
  图标弹?: number;
};

/** 界面像素 → 成片像素（画布左上角原点） */
export const 投 = (t: 取景, 宽: number, 高: number) => ({
  x: (u: number) => Math.round(宽 / 2 + (u - t.中心.x) * t.尺),
  y: (v: number) => Math.round(高 / 2 + (v - t.中心.y) * t.尺),
});

// ---------- 方块贴图（别的版本的图标） ----------
let 图集: Png | null = null;
/** 方块表.png 是一张 16 像素宽的竖条（一格一张贴图，按 textureNames 的顺序往下排）；列数按图宽算，图集要是改成多列也对 */
const 贴图像素 = (名: string): Uint8Array => {
  图集 ??= png(atlasUri);
  const k = textureNames.indexOf(`minecraft:block/${名}`);
  if (k < 0) throw new Error(`方块图集里没有 ${名}`);
  const 列 = 图集.w / 16;
  const x0 = (k % 列) * 16, y0 = Math.floor(k / 列) * 16;
  const out = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) out.set(图集.px.subarray(((y0 + y) * 图集.w + x0) * 4, ((y0 + y) * 图集.w + x0 + 16) * 4), y * 64);
  return out;
};
/** 原版平原的草色（plains grass_color 由温度 0.8、湿度 0.4 查色图得 #91BD59），草方块顶面、侧面的草边叠加层乘它 */
const 平原草色 = [0x91, 0xbd, 0x59];
const 方块图标缓存 = new Map<string, Uint8Array>();
export const 方块图标 = (名: string): Uint8Array => {
  let px = 方块图标缓存.get(名);
  if (px) return px;
  px = 贴图像素(名);
  if (名 === 'grass_block_top') for (let p = 0; p < 256; p++) for (let c = 0; c < 3; c++) px[p * 4 + c] = Math.round((px[p * 4 + c]! * 平原草色[c]!) / 255);
  if (名 === 'grass_block_side') {
    const 叠 = 贴图像素('grass_block_side_overlay');
    for (let p = 0; p < 256; p++) {
      if (叠[p * 4 + 3]! < 128) continue;
      for (let c = 0; c < 3; c++) px[p * 4 + c] = Math.round((叠[p * 4 + c]! * 平原草色[c]!) / 255);
    }
  }
  方块图标缓存.set(名, px);
  return px;
};

// ---------- 画 ----------
export type 投影 = ReturnType<typeof 投>;

const 填 = (ctx: CanvasRenderingContext2D, P: 投影, 色值: string, u0: number, v0: number, u1: number, v1: number) => {
  const x0 = P.x(u0), y0 = P.y(v0);
  ctx.fillStyle = 色值;
  ctx.fillRect(x0, y0, P.x(u1) - x0, P.y(v1) - y0);
};

/** 像素画的圆角矩形：四个角各缺一个界面像素；边 = 1 界面像素宽的描边色（不给 = 不描） */
const 圆角块 = (ctx: CanvasRenderingContext2D, P: 投影, 底: string, 边: string | null, u0: number, v0: number, u1: number, v1: number) => {
  if (边) {
    填(ctx, P, 边, u0 + 1, v0, u1 - 1, v1);
    填(ctx, P, 边, u0, v0 + 1, u1, v1 - 1);
    填(ctx, P, 底, u0 + 1, v0 + 1, u1 - 1, v1 - 1);
  } else {
    填(ctx, P, 底, u0 + 1, v0, u1 - 1, v1);
    填(ctx, P, 底, u0, v0 + 1, u1, v1 - 1);
  }
};

/** 一张 n×n 的 RGBA 画进界面像素框 (u0, v0, 边)：每个像素 边/n 界面像素；透 返回 true 的像素清成透明 */
export const 画方图 = (ctx: CanvasRenderingContext2D, P: 投影, px: Uint8Array, n: number, u0: number, v0: number, 边: number, 透?: (i: number, j: number) => boolean) => {
  const 步 = 边 / n;
  for (let j = 0; j < n; j++) {
    const y0 = P.y(v0 + j * 步), y1 = P.y(v0 + (j + 1) * 步);
    for (let i = 0; i < n; i++) {
      const x0 = P.x(u0 + i * 步), x1 = P.x(u0 + (i + 1) * 步);
      if (透?.(i, j)) {
        ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
        continue;
      }
      const o = (j * n + i) * 4;
      if (px[o + 3]! < 128) continue;
      ctx.fillStyle = `rgb(${px[o]},${px[o + 1]},${px[o + 2]})`;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
};

/** 鼠标箭头（经典的白芯黑边箭头，12×19 界面像素，尖在左上角）。X 黑边、W 白芯 */
const 箭头 = [
  'X', 'XX', 'XWX', 'XWWX', 'XWWWX', 'XWWWWX', 'XWWWWWX', 'XWWWWWWX', 'XWWWWWWWX', 'XWWWWWWWWX', 'XWWWWWWWWWX', 'XWWWWWWXXXXX',
  'XWWWXWWX', 'XWWX XWWX', 'XWX  XWWX', 'XX    XWWX', 'X     XWWX', '       XWWX', '        XX',
];
const 画光标 = (ctx: CanvasRenderingContext2D, P: 投影, u: number, v: number) => {
  箭头.forEach((行, j) => {
    for (let i = 0; i < 行.length; i++) {
      const c = 行[i];
      if (c !== 'X' && c !== 'W') continue;
      填(ctx, P, c === 'X' ? 色.光标边 : 色.光标, u + i, v + j, u + i + 1, v + j + 1);
    }
  });
};

/** 画整张启动器（先清画布，铺满） */
export const 画启动器 = (ctx: CanvasRenderingContext2D, 宽: number, 高: number, s: 启动器状态) => {
  const P = 投(s.取景, 宽, 高);
  ctx.clearRect(0, 0, 宽, 高);
  ctx.fillStyle = 色.底;
  ctx.fillRect(0, 0, 宽, 高);
  const 原点 = { x: P.x(0), y: P.y(0) };
  const 字线 = 歌词带底 * (高 / 1440);
  /** 一行字（行顶 v）：上沿高过歌词那一行的下沿就不画 */
  const 写 = (字: string, u: number, v: number, 字色: string) => {
    if (P.y(v) < 字线) return;
    启动器字.画(ctx, 字, 原点, u, v, 字色, s.取景.尺);
  };
  const 左 = 布局.卡左, 右 = 布局.卡右;
  卡们.forEach((卡, k) => {
    const 排 = 卡排[k]!;
    圆角块(ctx, P, 色.卡, 色.卡边, 左, 排.上, 右, 排.底);
    写(卡.头, 左 + 布局.卡头字.x, 排.上 + 布局.卡头字.y, 色.卡头);
    卡.实例们.forEach((实例, n) => {
      const top = 排.行起 + n * 布局.行高;
      const 是合照 = 实例.图标 === '合照';
      if (是合照 && s.行态) {
        const r = 布局.悬停让;
        圆角块(ctx, P, s.行态 === 2 ? 色.按下 : 色.悬停, 色.悬停边, 左 + r.左, top + r.上, 右 - r.右, top + 布局.行高 - r.下);
      }
      const ix = 左 + 布局.图标.x, iy = top + 布局.图标.y, 边 = 布局.图标.边;
      if (是合照) {
        const 弹 = s.图标弹 ?? 0;
        // 图标外一圈 1 界面像素的淡灰边，衬出照片
        填(ctx, P, 色.图标边, ix - 1 - 弹, iy - 1 - 弹, ix + 边 + 1 + 弹, iy + 边 + 1 + 弹);
        ctx.clearRect(P.x(ix - 弹), P.y(iy - 弹), P.x(ix + 边 + 弹) - P.x(ix - 弹), P.y(iy + 边 + 弹) - P.y(iy - 弹));
        画方图(ctx, P, s.图标, 图标边, ix - 弹, iy - 弹, 边 + 2 * 弹, s.图标透);
      } else 画方图(ctx, P, 方块图标(实例.图标), 16, ix, iy, 边);
      写(实例.标题, 左 + 布局.标题.x, top + 布局.标题.y, 色.标题);
      写(实例.副标题, 左 + 布局.副标题.x, top + 布局.副标题.y, 色.副标题);
    });
  });
  if (s.光标) 画光标(ctx, P, Math.round(s.光标.x), Math.round(s.光标.y));
};
