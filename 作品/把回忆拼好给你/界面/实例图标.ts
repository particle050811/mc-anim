// 启动器实例列表里「六月樱」那一格方形图标：一张图（截图、合照）→ 64×64 的图标像素，旧的那张再褪色、蒙灰。纯模块（不 import react、three），测试直接引。
// 第 0 镜、片尾（场/2-启动器）用它画图标；第 11 句「照片缩成一个方块，褪色蒙灰，正是第 0 镜那一格图标的样子」也该用它，两头才对得上。
// 图标 64×64 个图标像素、画成启动器的 32×32 界面像素（一个图标像素半个界面像素）：启动器按一个界面像素 12 个成片像素画时，一个图标像素正好 6 个，和全片 像素N 一样。
// 外圈留一道相纸白边（第 11 句那张拍立得缩成方块，白边还在），白边一起褪色、蒙灰。
import type { Png } from '@engine/model/贴图.ts';
import { 相纸 } from '../特效/照片画.ts';

/** 图标边长（图标像素） */
export const 图标边 = 64;
/** 相纸白边几个图标像素宽（Agent 暂定：一个界面像素，缩小后还看得出是一张照片） */
export const 图标白边 = 2;

const 夹 = (x: number) => Math.min(255, Math.max(0, Math.round(x)));

/** 一张图 → 边×边 的 RGBA：取正中的正方形，按面积平均缩小（源像素跨格的按覆盖面积分），透明按不透明算 */
export const 取图标 = (图: Png, 边 = 图标边): Uint8Array => {
  const s = Math.min(图.w, 图.h);
  const x0 = (图.w - s) / 2;
  const y0 = (图.h - s) / 2;
  const 步 = s / 边;
  const out = new Uint8Array(边 * 边 * 4);
  for (let j = 0; j < 边; j++)
    for (let i = 0; i < 边; i++) {
      const ax = x0 + i * 步, bx = ax + 步, ay = y0 + j * 步, by = ay + 步;
      const acc = [0, 0, 0];
      let 面 = 0;
      for (let y = Math.floor(ay); y < Math.ceil(by); y++) {
        const wy = Math.min(by, y + 1) - Math.max(ay, y);
        if (wy <= 0) continue;
        for (let x = Math.floor(ax); x < Math.ceil(bx); x++) {
          const wx = Math.min(bx, x + 1) - Math.max(ax, x);
          if (wx <= 0) continue;
          const o = (y * 图.w + x) * 4;
          const w = wx * wy;
          for (let c = 0; c < 3; c++) acc[c] += 图.px[o + c]! * w;
          面 += w;
        }
      }
      const p = (j * 边 + i) * 4;
      for (let c = 0; c < 3; c++) out[p + c] = 夹(acc[c]! / 面);
      out[p + 3] = 255;
    }
  return out;
};

/** 外圈 宽 个像素涂成相纸白（改 px 本身，也返回它） */
export const 加白边 = (px: Uint8Array, 边 = 图标边, 宽 = 图标白边): Uint8Array => {
  const 纸 = [1, 3, 5].map((i) => parseInt(相纸.色.slice(i, i + 2), 16));
  for (let j = 0; j < 边; j++)
    for (let i = 0; i < 边; i++) {
      if (i >= 宽 && j >= 宽 && i < 边 - 宽 && j < 边 - 宽) continue;
      px.set([纸[0]!, 纸[1]!, 纸[2]!, 255], (j * 边 + i) * 4);
    }
  return px;
};

/** 定死的散列（同一张图每次一样），返回 [0, 1) */
export const 散 = (a: number, b: number, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

/**
 * 褪色、蒙灰（Agent 暂定的做法和数，出静帧看过再改）：
 * 褪色 = 饱和降到 褪色饱和、反差收到 褪色反差、往旧纸的暖灰里拉一截（像晒久了的相片）；
 * 蒙灰 = 一层灰（四角、四边积得厚，中间薄）+ 一个个图标像素大的灰点（像落在屏幕图标上的灰尘，点的位置按散列定死）。
 * 程度 0～1：0 原样，1 就是第 0 镜那一格；第 11 句照片缩成图标时可以从 0 推到 1。
 */
export const 褪色参数 = { 饱和: 0.35, 反差: 0.72, 纸: [196, 188, 172] as const, 拉纸: 0.22, 灰: [168, 166, 160] as const, 灰底: 0.1, 灰边: 0.22, 灰点密: 0.09, 灰点重: 0.45 };

export const 褪色蒙灰 = (px: Uint8Array, 边 = 图标边, 程度 = 1, 种子 = 0): Uint8Array => {
  const k = Math.min(1, Math.max(0, 程度));
  const p = 褪色参数;
  const out = new Uint8Array(px.length);
  for (let j = 0; j < 边; j++)
    for (let i = 0; i < 边; i++) {
      const o = (j * 边 + i) * 4;
      let r = px[o]!, g = px[o + 1]!, b = px[o + 2]!;
      const 亮 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const 饱 = 1 + (p.饱和 - 1) * k;
      const 反 = 1 + (p.反差 - 1) * k;
      [r, g, b] = [r, g, b].map((v) => (亮 + (v - 亮) * 饱 - 128) * 反 + 128) as [number, number, number];
      [r, g, b] = [r, g, b].map((v, c) => v + (p.纸[c]! - v) * p.拉纸 * k) as [number, number, number];
      // 灰：离最近的边越近越厚（边上 灰边，往里四分之一处淡到 灰底）
      const 近边 = Math.min(i + 0.5, j + 0.5, 边 - i - 0.5, 边 - j - 0.5) / 边;
      const 厚 = p.灰底 + (p.灰边 - p.灰底) * Math.max(0, 1 - 近边 * 4);
      const 点 = 散(i, j, 种子) < p.灰点密 ? p.灰点重 * (0.6 + 0.4 * 散(j, i, 种子 + 1)) : 0;
      const 灰 = Math.min(1, 厚 + 点) * k;
      [r, g, b] = [r, g, b].map((v, c) => v + (p.灰[c]! - v) * 灰) as [number, number, number];
      out[o] = 夹(r);
      out[o + 1] = 夹(g);
      out[o + 2] = 夹(b);
      out[o + 3] = px[o + 3]!;
    }
  return out;
};
