// 真实方块的贴图图集（体素世界视频级、关键帧级共用）：lib/真实方块表.ts 里每个贴图号一格，原版贴图原样（模型/场景/关键帧/方块表.png），带自己生成的多级纹理。
// 接口：`blockAtlas()`：{ 原, 实, 行 }。原 = 原样贴图（镂空花草、树叶按透明度丢像素）；实 = 实心版（透明像素填成不透明像素平均色 × 0.6，远处实心树叶用，按导出网格画面校准）。
//   都是 THREE.DataTexture：每行 列 格，第 k 级每格 16 >> k 像素到 1 像素；格子之间不混色。`blockAtlasGlsl()`：着色器里的 atlasUv(贴图号, 格内坐标 0～1) → 图集 uv
// 多级纹理照 Voxy（voxy/src/main/java/me/cortex/voxy/client/core/model/MipGen.java、TextureUtils.mipColours）：镂空贴图先把透明像素颜色填成最近不透明像素的颜色（solidify，免得远处树叶花草被透明处的黑色拖暗），再在线性空间 2×2 平均往下缩（16 → 8 → 4 → 2 → 1，同 方块网格.tsx 封顶 4 级）。
import * as THREE from 'three';
import texUri from 'asset:贴图/场景/关键帧/方块表';
import { png } from '../model/贴图.ts';
import { flattenAtlasColors, flatColorBlocks } from './纯色方块.ts';

const HOLE = 0.6;
const ATLAS_COLS = 16; // 图集每行 16 张

// sRGB ↔ 线性
const toLin = (c: number) => Math.pow(c / 255, 2.2);
const toSrgb = (c: number) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2));

// 一张 16×16 贴图的多级纹理：[16×16, 8×8, 4×4, 2×2, 1×1]，每级 RGBA
const buildMips = (px: Uint8Array, solidFill: boolean): Uint8Array[] => {
  const t = new Uint8Array(px);
  let hasAlpha = false;
  for (let pixIdx = 0; pixIdx < 256; pixIdx++) if (t[pixIdx * 4 + 3] < 128) hasAlpha = true;
  if (hasAlpha && solidFill) {
    let sumR = 0, sumG = 0, sumB = 0, opaqueCount = 0;
    for (let pixIdx = 0; pixIdx < 256; pixIdx++) if (t[pixIdx * 4 + 3] >= 128) { sumR += t[pixIdx * 4]; sumG += t[pixIdx * 4 + 1]; sumB += t[pixIdx * 4 + 2]; opaqueCount++; }
    for (let pixIdx = 0; pixIdx < 256; pixIdx++) {
      if (t[pixIdx * 4 + 3] < 128 && opaqueCount) { t[pixIdx * 4] = (sumR / opaqueCount) * HOLE; t[pixIdx * 4 + 1] = (sumG / opaqueCount) * HOLE; t[pixIdx * 4 + 2] = (sumB / opaqueCount) * HOLE; }
      t[pixIdx * 4 + 3] = 255;
    }
  } else if (hasAlpha) {
    // solidify：透明像素的颜色填成最近的不透明像素的颜色（四邻接一圈圈往外扩，同 MipGen.solidify），透明度不变
    const from = new Int16Array(256).fill(-1);
    let frontier = [] as number[];
    for (let pixIdx = 0; pixIdx < 256; pixIdx++) if (t[pixIdx * 4 + 3] !== 0) { from[pixIdx] = pixIdx; frontier.push(pixIdx); }
    while (frontier.length) {
      const nextFrontier = [] as number[];
      for (const pixIdx of frontier) {
        const x = pixIdx & 15, y = pixIdx >> 4;
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nbrX = x + ax, nbrY = y + ay;
          if (nbrX < 0 || nbrY < 0 || nbrX > 15 || nbrY > 15) continue;
          const q2 = nbrY * 16 + nbrX;
          if (from[q2] >= 0) continue;
          from[q2] = from[pixIdx];
          nextFrontier.push(q2);
        }
      }
      frontier = nextFrontier;
    }
    for (let pixIdx = 0; pixIdx < 256; pixIdx++) if (t[pixIdx * 4 + 3] === 0 && from[pixIdx] >= 0) for (let channel = 0; channel < 3; channel++) t[pixIdx * 4 + channel] = t[from[pixIdx] * 4 + channel];
  }
  const out = [t];
  for (let size = 8; size >= 1; size >>= 1) {
    const prev = out[out.length - 1];
    const ps = size * 2;
    const level = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const srcIdx = ((y * 2 + dy) * ps + x * 2 + dx) * 4;
          sumR += toLin(prev[srcIdx]);
          sumG += toLin(prev[srcIdx + 1]);
          sumB += toLin(prev[srcIdx + 2]);
          sumA += prev[srcIdx + 3];
        }
        const dstIdx = (y * size + x) * 4;
        level[dstIdx] = toSrgb(sumR / 4);
        level[dstIdx + 1] = toSrgb(sumG / 4);
        level[dstIdx + 2] = toSrgb(sumB / 4);
        level[dstIdx + 3] = Math.round(sumA / 4);
      }
    out.push(level);
  }
  return out;
};

// 图集：每张贴图占一格，多级纹理每级都按格排（第 k 级每格 16 >> k 像素），格子之间不混色
let atlas: { original: THREE.DataTexture; solid: THREE.DataTexture; rows: number } | null = null;
export const blockAtlas = () => {
  if (atlas) return atlas;
  const sheet = flatColorBlocks ? flattenAtlasColors(png(texUri), '不分') : png(texUri);
  const texCount = sheet.h / 16;
  const rows = Math.ceil(texCount / ATLAS_COLS);
  const mk = (solidFill: boolean) => {
    const levels = [0, 1, 2, 3, 4].map((k) => {
      const cellPx = 16 >> k;
      return { width: ATLAS_COLS * cellPx, height: rows * cellPx, data: new Uint8Array(ATLAS_COLS * cellPx * rows * cellPx * 4) };
    });
    for (let texIdx = 0; texIdx < texCount; texIdx++) {
      const mips = buildMips(sheet.px.subarray(texIdx * 1024, (texIdx + 1) * 1024), solidFill);
      const cx = texIdx % ATLAS_COLS, cy = Math.floor(texIdx / ATLAS_COLS);
      mips.forEach((mip, k) => {
        const cellPx = 16 >> k;
        const level = levels[k];
        for (let y = 0; y < cellPx; y++) level.data.set(mip.subarray(y * cellPx * 4, (y + 1) * cellPx * 4), ((cy * cellPx + y) * level.width + cx * cellPx) * 4);
      });
    }
    const t = new THREE.DataTexture(levels[0].data, levels[0].width, levels[0].height, THREE.RGBAFormat);
    t.mipmaps = levels as unknown as THREE.DataTexture['mipmaps'];
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  };
  atlas = { original: mk(false), solid: mk(true), rows: rows };
  return atlas;
};


export const blockAtlasGlsl = () => {
  const rows = blockAtlas().rows;
  return `
vec2 atlasUv(float layer, vec2 f) {
  vec2 cell = vec2(mod(layer, ${ATLAS_COLS}.0), floor(layer / ${ATLAS_COLS}.0));
  return (cell + f) / vec2(${ATLAS_COLS}.0, ${rows}.0);
}`;
};
