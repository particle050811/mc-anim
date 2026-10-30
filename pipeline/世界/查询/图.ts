// 查询出图的画布：RGB 像素、带坐标网格和刻度数字（3×5 点阵字，只有数字、负号和几个字母，够标坐标），fast-png 编码。
import { encode } from 'fast-png';
import type { RGB } from './颜色.ts';

// 3×5 点阵：每字 5 行，每行 3 位（高位在左）
const 字形: Record<string, number[]> = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 7, 1, 7], '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 1, 1, 1], '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7],
  '-': [0, 0, 7, 0, 0], x: [0, 5, 2, 5, 0], y: [5, 5, 2, 2, 2], z: [0, 7, 2, 4, 7], '=': [0, 7, 0, 7, 0], '.': [0, 0, 0, 0, 2], ' ': [0, 0, 0, 0, 0],
};

export class 画布 {
  readonly 宽: number;
  readonly 高: number;
  readonly 像素: Uint8Array;

  constructor(宽: number, 高: number, 底色: RGB = [255, 255, 255]) {
    this.宽 = 宽;
    this.高 = 高;
    this.像素 = new Uint8Array(宽 * 高 * 3);
    for (let i = 0; i < 宽 * 高; i++) this.像素.set(底色, i * 3);
  }

  点(x: number, y: number, c: RGB, 透 = 1) {
    if (x < 0 || y < 0 || x >= this.宽 || y >= this.高) return;
    const o = (y * this.宽 + x) * 3;
    for (let k = 0; k < 3; k++) this.像素[o + k] = Math.round(this.像素[o + k]! * (1 - 透) + c[k]! * 透);
  }

  矩形(x: number, y: number, w: number, h: number, c: RGB, 透 = 1) {
    for (let j = Math.max(0, y); j < Math.min(this.高, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.宽, x + w); i++) this.点(i, j, c, 透);
  }

  /** 字的宽（像素） */
  static 字宽 = (s: string, 倍 = 2) => s.length * 4 * 倍 - 倍;

  字(x: number, y: number, s: string, c: RGB = [0, 0, 0], 倍 = 2) {
    [...s].forEach((ch, n) => {
      const g = 字形[ch] ?? 字形[' ']!;
      g.forEach((row, r) => {
        for (let b = 0; b < 3; b++) if (row & (4 >> b)) this.矩形(x + (n * 4 + b) * 倍, y + r * 倍, 倍, 倍, c);
      });
    });
  }

  png() {
    return Buffer.from(encode({ width: this.宽, height: this.高, data: this.像素, channels: 3, depth: 8 }));
  }
}

/** 网格间距（方块）：让相邻两条线在图上至少隔 最小像素 */
export const 网格间距 = (每格像素: number, 最小像素 = 64) => {
  for (const s of [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096]) if (s * 每格像素 >= 最小像素) return s;
  return 8192;
};

/** 图上一个方块占几个像素（放大）或一个像素几个方块（缩小，步 > 1），让长边落在 [512, 2048] 附近 */
export const 比例 = (长边格数: number, 指定像素?: number): { 像素: number; 步: number } => {
  if (指定像素) return { 像素: 指定像素, 步: 1 };
  if (长边格数 <= 1024) return { 像素: Math.max(1, Math.min(16, Math.floor(1024 / 长边格数))), 步: 1 };
  return { 像素: 1, 步: Math.ceil(长边格数 / 2048) };
};

/**
 * 带边框的图：左边、上边留刻度。格(i, j) 是内容里第 i 列、第 j 行（每格 像素 × 像素）；
 * 横轴值 = 横起 + i·步，竖轴值 = 竖起 + 竖向·j·步（竖向 −1：往下值变小，切面图的 y）
 */
export class 坐标图 {
  readonly 布: 画布;
  readonly 左 = 64;
  readonly 上 = 22;
  private o: { 列: number; 行: number; 像素: number; 步: number; 横起: number; 竖起: number; 竖向: 1 | -1; 横名: string; 竖名: string };

  constructor(o: 坐标图['o']) {
    this.o = o;
    this.布 = new 画布(this.左 + o.列 * o.像素 + 8, this.上 + o.行 * o.像素 + 8, [250, 250, 250]);
  }

  格(i: number, j: number, c: RGB) {
    const p = this.o.像素;
    if (p === 1) this.布.点(this.左 + i, this.上 + j, c);
    else this.布.矩形(this.左 + i * p, this.上 + j * p, p, p, c);
  }

  /** 画网格线和刻度（内容画完再调） */
  网格() {
    const { 列, 行, 像素, 步, 横起, 竖起, 竖向, 横名, 竖名 } = this.o;
    const 每格 = 像素 / 步;
    const 间 = 网格间距(每格);
    const 线色: RGB = [255, 255, 255];
    const 横末 = 横起 + (列 - 1) * 步;
    for (let v = Math.ceil(横起 / 间) * 间; v <= 横末; v += 间) {
      const px = this.左 + Math.round(((v - 横起) / 步) * 像素);
      this.布.矩形(px, this.上, 1, 行 * 像素, 线色, 0.45);
      const s = String(v);
      this.布.字(px - Math.floor(画布.字宽(s) / 2), 6, s);
    }
    const 竖末 = 竖起 + 竖向 * (行 - 1) * 步;
    const [lo, hi] = 竖向 > 0 ? [竖起, 竖末] : [竖末, 竖起];
    for (let v = Math.ceil(lo / 间) * 间; v <= hi; v += 间) {
      const py = this.上 + Math.round((((v - 竖起) * 竖向) / 步) * 像素);
      this.布.矩形(this.左, py, 列 * 像素, 1, 线色, 0.45);
      const s = String(v);
      this.布.字(this.左 - 6 - 画布.字宽(s), py - 5, s);
    }
    this.布.字(4, 6, 横名);
    this.布.字(4, this.上 + 4, 竖名);
  }
}
