// 照片做成原版地图画（照片方案 10-24：照片挂在后墙的荧光展示框里，地图放进框铺满一格）：照片的画面裁成正方形、缩小、压到原版地图的调色板，白边画在地图像素里。
// 一格多少地图像素按镜头的 N 取，地图像素才落在整成片像素上：N 是 4 的倍数用 64（第 8 句 16、第 14 句分屏 8），N = 10 的门口整屏镜头用 32（照片方案的核实）。
// 原版地图一格是 128 个像素，这里是演绎：截图转地图画要靠插件或模组，有效分辨率压到 32、64，比方块贴图细 2、4 倍。
// 纯模块（不 import react、three），测试能直接引；照片墙.tsx 按它做贴图。
import type { PhotoSource } from './照片图.ts';

/** 原版地图的基色（1.20.1 net.minecraft.world.level.material.MapColor，id 1～61；id 0 是透明），#rrggbb */
export const mapBaseColors: readonly string[] = [
  '#7fb238', '#f7e9a3', '#c7c7c7', '#ff0000', '#a0a0ff', '#a7a7a7', '#007c00', '#ffffff', '#a4a8b8', '#976d4d', // GRASS … DIRT
  '#707070', '#4040ff', '#8f7748', '#fffcf5', '#d87f33', '#b24cd8', '#6699d8', '#e5e533', '#7fcc19', '#f27fa5', // STONE … COLOR_PINK
  '#4c4c4c', '#999999', '#4c7f99', '#7f3fb2', '#334cb2', '#664c33', '#667f33', '#993333', '#191919', '#faee4d', // COLOR_GRAY … GOLD
  '#5cdbd5', '#4a80ff', '#00d93a', '#815631', '#700200', '#d1b1a1', '#9f5224', '#95576c', '#706c8a', '#ba8524', // DIAMOND … TERRACOTTA_YELLOW
  '#677535', '#a04d4e', '#392923', '#876b62', '#575c5c', '#7a4958', '#4c3e5c', '#4c3223', '#4c522a', '#8e3c2e', // TERRACOTTA_LIGHT_GREEN … TERRACOTTA_RED
  '#251610', '#bd3031', '#943f61', '#5c191d', '#167e86', '#3a8e8c', '#562c3e', '#14b485', '#646464', '#d8af93', // TERRACOTTA_BLACK … RAW_IRON
  '#7fa796', // GLOW_LICHEN
];

/** 每个基色的四档亮度（MapColor.Brightness：LOW 180、NORMAL 220、HIGH 255、LOWEST 135，除以 255 乘到基色上） */
export const mapBrightnessTiers = [180, 220, 255, 135] as const;

type RGB = readonly [number, number, number];
const hexToRgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** 地图能画的全部颜色（61 × 4 = 244 个） */
export const mapPalette: readonly RGB[] = mapBaseColors.flatMap((h) => {
  const c = hexToRgb(h);
  return mapBrightnessTiers.map((b) => [Math.floor((c[0] * b) / 255), Math.floor((c[1] * b) / 255), Math.floor((c[2] * b) / 255)] as const);
});

/** 离 (r, g, b) 最近的地图色：按「红均值」加权的 RGB 距离（比直接欧氏距离更接近人眼，肤色、天色不容易跳到灰上） */
export const snapToMapColor = (r: number, g: number, b: number): RGB => {
  let bestColor = mapPalette[0]!;
  let minDist = Infinity;
  for (const c of mapPalette) {
    const rm = (r + c[0]) / 2;
    const [dr, dg, db] = [r - c[0], g - c[1], b - c[2]];
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < minDist) [minDist, bestColor] = [d, c];
  }
  return bestColor;
};

/** 一格多少地图像素：32 或 64（见文件头） */
export type MapSize = 32 | 64;

/** 白边几个地图像素：一格的 1/16（32 时 2 个、64 时 4 个，都是半个方块贴图像素宽）；白取 SNOW 最亮那档（#ffffff） */
export const whiteBorder = (sideLength: MapSize) => sideLength / 16;
const white: RGB = [255, 255, 255];

/** 一张照片的地图画（边长 × 边长 的 RGBA，从上往下一行行排）：画面居中裁成正方形，按面积平均缩到 边长 − 2·白边，每个像素压到最近的地图色，外面一圈白边 */
export const mapPixels = (photoSource: PhotoSource, sideLength: MapSize): Uint8Array => {
  const { w, h, px } = photoSource.图;
  const side = Math.min(w, h);
  const [x0, y0] = [(w - side) / 2, (h - side) / 2];
  const innerSize = sideLength - 2 * whiteBorder(sideLength);
  const pixelStep = side / innerSize;
  const out = new Uint8Array(sideLength * sideLength * 4);
  for (let p = 0; p < sideLength * sideLength; p++) out.set([...white, 255], p * 4);
  for (let j = 0; j < innerSize; j++)
    for (let i = 0; i < innerSize; i++) {
      // 这个地图像素盖住的源像素区域 [a, b) × [c, d)，按覆盖面积加权平均
      const [a, b, c, d] = [x0 + i * pixelStep, x0 + (i + 1) * pixelStep, y0 + j * pixelStep, y0 + (j + 1) * pixelStep];
      const sum = [0, 0, 0];
      let weightSum = 0;
      for (let y = Math.floor(c); y < Math.ceil(d); y++)
        for (let x = Math.floor(a); x < Math.ceil(b); x++) {
          const overlapArea = (Math.min(b, x + 1) - Math.max(a, x)) * (Math.min(d, y + 1) - Math.max(c, y));
          if (overlapArea <= 0) continue;
          const k = (y * w + x) * 4;
          sum[0] += px[k]! * overlapArea;
          sum[1] += px[k + 1]! * overlapArea;
          sum[2] += px[k + 2]! * overlapArea;
          weightSum += overlapArea;
        }
      const color = snapToMapColor(sum[0]! / weightSum, sum[1]! / weightSum, sum[2]! / weightSum);
      out.set([...color, 255], ((j + whiteBorder(sideLength)) * sideLength + i + whiteBorder(sideLength)) * 4);
    }
  return out;
};
