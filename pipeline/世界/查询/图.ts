// 查询出图的画布：RGB 像素、带坐标网格和刻度数字（3×5 点阵字，只有数字、负号和几个字母，够标坐标），fast-png 编码。
import { encode } from 'fast-png';
import type { RGB } from './颜色.ts';

// 3×5 点阵：每字 5 行，每行 3 位（高位在左）
const GLYPH_BITMAPS: Record<string, number[]> = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 7, 1, 7], '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 1, 1, 1], '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7],
  '-': [0, 0, 7, 0, 0], x: [0, 5, 2, 5, 0], y: [5, 5, 2, 2, 2], z: [0, 7, 2, 4, 7], '=': [0, 7, 0, 7, 0], '.': [0, 0, 0, 0, 2], ' ': [0, 0, 0, 0, 0],
};

export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;

  constructor(width: number, height: number, baseColor: RGB = [255, 255, 255]) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++) this.pixels.set(baseColor, i * 3);
  }

  points(x: number, y: number, c: RGB, alpha = 1) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const o = (y * this.width + x) * 3;
    for (let k = 0; k < 3; k++) this.pixels[o + k] = Math.round(this.pixels[o + k]! * (1 - alpha) + c[k]! * alpha);
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, alpha = 1) {
    for (let j = Math.max(0, y); j < Math.min(this.height, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.width, x + w); i++) this.points(i, j, c, alpha);
  }

  /** 字的宽（像素） */
  static textWidth = (s: string, pixelSize = 2) => s.length * 4 * pixelSize - pixelSize;

  char(x: number, y: number, s: string, c: RGB = [0, 0, 0], pixelSize = 2) {
    [...s].forEach((ch, n) => {
      const g = GLYPH_BITMAPS[ch] ?? GLYPH_BITMAPS[' ']!;
      g.forEach((row, r) => {
        for (let b = 0; b < 3; b++) if (row & (4 >> b)) this.rect(x + (n * 4 + b) * pixelSize, y + r * pixelSize, pixelSize, pixelSize, c);
      });
    });
  }

  png() {
    return Buffer.from(encode({ width: this.width, height: this.height, data: this.pixels, channels: 3, depth: 8 }));
  }
}

/** 网格间距（方块）：让相邻两条线在图上至少隔 最小像素 */
export const gridSpacing = (pixelsPerCell: number, minPixel = 64) => {
  for (const s of [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096]) if (s * pixelsPerCell >= minPixel) return s;
  return 8192;
};

/** 图上一个方块占几个像素（放大）或一个像素几个方块（缩小，步 > 1），让长边落在 [512, 2048] 附近 */
export const ratioFor = (ratioFor: number, specifiedPixel?: number): { pixel: number; step: number } => {
  if (specifiedPixel) return { pixel: specifiedPixel, step: 1 };
  if (ratioFor <= 1024) return { pixel: Math.max(1, Math.min(16, Math.floor(1024 / ratioFor))), step: 1 };
  return { pixel: 1, step: Math.ceil(ratioFor / 2048) };
};

/**
 * 带边框的图：左边、上边留刻度。格(i, j) 是内容里第 i 列、第 j 行（每格 像素 × 像素）；
 * 横轴值 = 横起 + i·步，竖轴值 = 竖起 + 竖向·j·步（竖向 −1：往下值变小，切面图的 y）
 */
export class CoordChart {
  readonly canvas: Canvas;
  readonly left = 64;
  readonly 上 = 22;
  private o: { 列: number; 行: number; pixel: number; step: number; horizStart: number; vertStart: number; vertDir: 1 | -1; horizontalLabel: string; verticalLabel: string };

  constructor(o: CoordChart['o']) {
    this.o = o;
    this.canvas = new Canvas(this.left + o.列 * o.pixel + 8, this.上 + o.行 * o.pixel + 8, [250, 250, 250]);
  }

  cell(i: number, j: number, c: RGB) {
    const p = this.o.pixel;
    if (p === 1) this.canvas.points(this.left + i, this.上 + j, c);
    else this.canvas.rect(this.left + i * p, this.上 + j * p, p, p, c);
  }

  /** 画网格线和刻度（内容画完再调） */
  grid() {
    const { 列: colCount, 行: rows, pixel, step: stride, horizStart, vertStart, vertDir, horizontalLabel, verticalLabel } = this.o;
    const pxPerCell = pixel / stride;
    const spacing = gridSpacing(pxPerCell);
    const lineColor: RGB = [255, 255, 255];
    const horizontalEnd = horizStart + (colCount - 1) * stride;
    for (let v = Math.ceil(horizStart / spacing) * spacing; v <= horizontalEnd; v += spacing) {
      const px = this.left + Math.round(((v - horizStart) / stride) * pixel);
      this.canvas.rect(px, this.上, 1, rows * pixel, lineColor, 0.45);
      const s = String(v);
      this.canvas.char(px - Math.floor(Canvas.textWidth(s) / 2), 6, s);
    }
    const verticalEnd = vertStart + vertDir * (rows - 1) * stride;
    const [lo, hi] = vertDir > 0 ? [vertStart, verticalEnd] : [verticalEnd, vertStart];
    for (let v = Math.ceil(lo / spacing) * spacing; v <= hi; v += spacing) {
      const py = this.上 + Math.round((((v - vertStart) * vertDir) / stride) * pixel);
      this.canvas.rect(this.left, py, colCount * pixel, 1, lineColor, 0.45);
      const s = String(v);
      this.canvas.char(this.left - 6 - Canvas.textWidth(s), py - 5, s);
    }
    this.canvas.char(4, 6, horizontalLabel);
    this.canvas.char(4, this.上 + 4, verticalLabel);
  }
}
