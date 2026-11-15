// 存档图标（原版「选择世界」列表里那一格 32×32 的世界图标）：一张图（截图、合照）→ 64×64 的图标像素，旧的那张再褪色、蒙灰。纯模块（不 import react、three），测试直接引。
// 第 0 镜、片尾（场/2-选择世界）用它画图标。三稿第 11 句「照片缩成一个方块，褪色蒙灰，正是第 0 镜那一格图标的样子」：首尾要对上，
// 褪色蒙灰照第 11 句下线图标的做法（门口之夜那一路 场/2-门口/门口之夜参数.ts 的 下线图标：相纸边收没、饱和降到 0.25、蒙一层 rgba(150,150,150,0.35) 的灰），
// 两边合进 main 以后该共用这一份数。
// 图标 64×64 个图标像素（原版世界图标 icon.png 也是 64×64）、画成 32×32 界面像素（一个图标像素半个界面像素）：界面按一个界面像素 12 个成片像素画时，一个图标像素正好 6 个，和全片 像素N 一样。
import type { Png } from '@engine/model/贴图.ts';

/** 图标边长（图标像素） */
export const iconEdge = 64;

const clampByte = (x: number) => Math.min(255, Math.max(0, Math.round(x)));

/** 源图里的一块正方形（源图像素，左上角 + 边长） */
export type CropBox = { x: number; y: number; side: number };

/** 源图正中的正方形 */
export const centerCrop = (img: Png): CropBox => {
  const s = Math.min(img.w, img.h);
  return { x: (img.w - s) / 2, y: (img.h - s) / 2, side: s };
};

/** 一张图 → 边×边 的 RGBA：取 裁 那块正方形（不给 = 正中的正方形），按面积平均缩小（源像素跨格的按覆盖面积分），透明按不透明算 */
export const getIcon = (img: Png, cropBox: CropBox = centerCrop(img), side = iconEdge): Uint8Array => {
  if (cropBox.x < 0 || cropBox.y < 0 || cropBox.x + cropBox.side > img.w + 1e-9 || cropBox.y + cropBox.side > img.h + 1e-9) throw new Error(`图标的裁框 ${JSON.stringify(cropBox)} 超出源图 ${img.w}×${img.h}`);
  const tileSize = cropBox.side / side;
  const out = new Uint8Array(side * side * 4);
  for (let j = 0; j < side; j++)
    for (let i = 0; i < side; i++) {
      const ax = cropBox.x + i * tileSize, bx = ax + tileSize, ay = cropBox.y + j * tileSize, by = ay + tileSize;
      const acc = [0, 0, 0];
      let faceArea = 0;
      for (let y = Math.floor(ay); y < Math.ceil(by); y++) {
        const wy = Math.min(by, y + 1) - Math.max(ay, y);
        if (wy <= 0) continue;
        for (let x = Math.floor(ax); x < Math.ceil(bx); x++) {
          const wx = Math.min(bx, x + 1) - Math.max(ax, x);
          if (wx <= 0) continue;
          const o = (y * img.w + x) * 4;
          const w = wx * wy;
          for (let c = 0; c < 3; c++) acc[c] += img.px[o + c]! * w;
          faceArea += w;
        }
      }
      const p = (j * side + i) * 4;
      for (let c = 0; c < 3; c++) out[p + c] = clampByte(acc[c]! / faceArea);
      out[p + 3] = 255;
    }
  return out;
};

/** 定死的散列（同一张图每次一样），返回 [0, 1) */
export const scatter = (a: number, b: number, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

/** 褪色蒙灰的数：同第 11 句下线图标（饱和 0.25、灰 rgba(150,150,150,0.35)） */
export const fadeParams = { saturation: 0.25, 灰: [150, 150, 150] as const, grayAlpha: 0.35 };

/**
 * 褪色、蒙灰：先按 CSS saturate() 的矩阵（Filter Effects 规范，在 sRGB 数值上做，同第 11 句画布 ctx.filter 的 saturate）降饱和，
 * 再按 灰透 盖一层 灰（source-over）。程度 0～1：0 原样，1 就是第 0 镜那一格；同第 11 句下线时饱和从 1 插到 褪色参数.饱和、灰的不透明度乘程度。
 */
export const fadeToGray = (px: Uint8Array, side = iconEdge, degree = 1): Uint8Array => {
  const k = Math.min(1, Math.max(0, degree));
  const p = fadeParams;
  const s = 1 + (p.saturation - 1) * k;
  const a = p.grayAlpha * k;
  const out = new Uint8Array(px.length);
  for (let n = 0; n < side * side; n++) {
    const o = n * 4;
    const r = px[o]!, g = px[o + 1]!, b = px[o + 2]!;
    const saturated = [
      (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
      (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
      (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
    ];
    for (let c = 0; c < 3; c++) out[o + c] = clampByte(saturated[c]! + (p.灰[c]! - saturated[c]!) * a);
    out[o + 3] = px[o + 3]!;
  }
  return out;
};
