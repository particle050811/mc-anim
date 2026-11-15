// 现实部分自画的像素贴图：在一张小画布上按贴图像素画（照原版贴图的画法：少色、一层按位置哈希的噪点，不用随机数，各帧一样），再做成最近邻的 three 贴图。
// 画布一个贴图像素 = 倍 个画布像素（默认 2）：unihex 汉字的点只有半个界面像素，倍 1 画不下（告示牌字.tsx 同理）；别的东西都按整贴图像素画。
// 贴图像素和方块一样大（一格 16 个），放进三渲二画布后是 画风.ts 的 像素N 个成片像素，所以和分屏另一半的门口同一种像素。
import * as THREE from 'three';
import { hash2 } from '@engine/core/噪声.ts';

export const canvasScale = 2;

export type PixelArt = {
  /** 贴图像素的宽高 */
  宽: number;
  高: number;
  c: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** 一个贴图像素 */
  点: (x: number, y: number, color: string) => void;
  /** 一块整贴图像素的方块（x、y、宽、高都按贴图像素） */
  fillRect: (x: number, y: number, width: number, height: number, color: string) => void;
  /** 一块方块里铺噪点：每个贴图像素按位置哈希从 色们 里挑一个（权 = 各色的份量，默认等分）；种 区分不同的东西，同一个种各帧一样 */
  noise: (x: number, y: number, width: number, height: number, pixelColors: readonly string[], seed: number, weights?: readonly number[]) => void;
  /** 擦成透明 */
  erase: (x: number, y: number, width: number, height: number) => void;
};

export const newPixelArt = (width: number, height: number, scale = canvasScale): PixelArt => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error(`像素画的宽高要是正整数：${width}×${height}`);
  const c = document.createElement('canvas');
  c.width = width * scale;
  c.height = height * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const fillRect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
  };
  const noise = (x: number, y: number, w: number, h: number, pixelColors: readonly string[], seed: number, weights?: readonly number[]) => {
    const effWeights = weights ?? pixelColors.map(() => 1);
    const weightSum = effWeights.reduce((a, b) => a + b, 0);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        let r = hash2(x + i, y + j, seed) * weightSum;
        let k = 0;
        while (k < pixelColors.length - 1 && r >= effWeights[k]!) r -= effWeights[k++]!;
        fillRect(x + i, y + j, 1, 1, pixelColors[k]!);
      }
  };
  return {
    宽: width,
    高: height,
    c,
    ctx,
    点: (x, y, color) => fillRect(x, y, 1, 1, color),
    fillRect,
    noise,
    erase: (x, y, w, h) => ctx.clearRect(x * scale, y * scale, w * scale, h * scale),
  };
};

/** 像素画 → three 贴图（最近邻、不做多级纹理、sRGB）。画布上透明的像素在材质里按 alphaTest 挖掉 */
export const makeTexture = (p: PixelArt): THREE.CanvasTexture => {
  const t = new THREE.CanvasTexture(p.c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/** 两个 #rrggbb 按 k（0～1）在 sRGB 数值上线性混 */
export const mixColor = (a: string, b: string, k: number): string => {
  const hexBytes = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [hexBytes(a), hexBytes(b)];
  const t = Math.min(1, Math.max(0, k));
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
