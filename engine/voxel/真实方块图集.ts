// 真实方块的贴图图集（体素世界视频级、关键帧级共用）：lib/真实方块表.ts 里每个贴图号一格，原版贴图原样（模型/场景/关键帧/方块表.png），带自己生成的多级纹理。
// 接口：`blockAtlas()`：{ 原, 实, 行, 格 }。原 = 原样贴图（镂空花草、树叶按透明度丢像素）；实 = 实心版（透明像素填成不透明像素平均色 × 0.6，远处实心树叶用，按导出网格画面校准）。
//   都是 THREE.DataTexture：每行 列 格，第 k 级每格 格 >> k 像素到 1 像素；格子之间不混色。`blockAtlasGlsl()`：着色器里的 atlasUv(贴图号, 格内坐标 0～1) → 图集 uv
// 格 = 竖条的宽：原版 16；作品选了 32x、64x 材质包时覆盖层给 32（pipeline/资产/材质包.ts 按 像素N 定，缺的原版贴图最近邻放大），要是 2 的幂。
// 多级纹理照 Voxy（voxy/src/main/java/me/cortex/voxy/client/core/model/MipGen.java、TextureUtils.mipColours）：镂空贴图先把透明像素颜色填成最近不透明像素的颜色（solidify，免得远处树叶花草被透明处的黑色拖暗），再在线性空间 2×2 平均往下缩（16 → 8 → 4 → 2 → 1，同 方块网格.tsx 封顶 4 级）。
import * as THREE from 'three';
import texUri from 'asset:贴图/场景/关键帧/方块表';
import { png } from '../model/贴图.ts';
import { flattenAtlasColors, flatColorBlocks } from './纯色方块.ts';

const HOLE = 0.6;
const ATLAS_COLS = 16; // 图集每行 16 张
// WebGL 纹理边长上限：Mac 上 Chrome（ANGLE、Metal）和多数显卡是 16384。128x、256x 试验包（材质包.ts ANIM_PACKS_TRY）按 16 列排会超高，
// 列数翻倍到放得下为止；放得下的（16x、32x、64x）照旧 16 列，着色器源码和段指纹不变
const MAX_TEX = 16384;
const colsFor = (cell: number, texCount: number) => {
  let cols = ATLAS_COLS;
  while (Math.ceil(texCount / cols) * cell > MAX_TEX && cols * 2 * cell <= MAX_TEX) cols *= 2;
  if (Math.ceil(texCount / cols) * cell > MAX_TEX) throw new Error(`方块图集 ${texCount} 张、一格 ${cell} 像素，排不进 ${MAX_TEX}×${MAX_TEX} 的纹理`);
  return cols;
};

// sRGB ↔ 线性
const toLin = (c: number) => Math.pow(c / 255, 2.2);
const toSrgb = (c: number) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2));

// 一张 格×格 贴图的多级纹理：[格×格, …, 2×2, 1×1]（16 时 5 级），每级 RGBA
const buildMips = (px: Uint8Array, solidFill: boolean, cell: number): Uint8Array[] => {
  const t = new Uint8Array(px);
  const n = cell * cell;
  let hasAlpha = false;
  for (let pixIdx = 0; pixIdx < n; pixIdx++) if (t[pixIdx * 4 + 3] < 128) hasAlpha = true;
  if (hasAlpha && solidFill) {
    let sumR = 0, sumG = 0, sumB = 0, opaqueCount = 0;
    for (let pixIdx = 0; pixIdx < n; pixIdx++) if (t[pixIdx * 4 + 3] >= 128) { sumR += t[pixIdx * 4]; sumG += t[pixIdx * 4 + 1]; sumB += t[pixIdx * 4 + 2]; opaqueCount++; }
    for (let pixIdx = 0; pixIdx < n; pixIdx++) {
      if (t[pixIdx * 4 + 3] < 128 && opaqueCount) { t[pixIdx * 4] = (sumR / opaqueCount) * HOLE; t[pixIdx * 4 + 1] = (sumG / opaqueCount) * HOLE; t[pixIdx * 4 + 2] = (sumB / opaqueCount) * HOLE; }
      t[pixIdx * 4 + 3] = 255;
    }
  } else if (hasAlpha) {
    // solidify：透明像素的颜色填成最近的不透明像素的颜色（四邻接一圈圈往外扩，同 MipGen.solidify），透明度不变
    const from = new Int32Array(n).fill(-1);
    let frontier = [] as number[];
    for (let pixIdx = 0; pixIdx < n; pixIdx++) if (t[pixIdx * 4 + 3] !== 0) { from[pixIdx] = pixIdx; frontier.push(pixIdx); }
    while (frontier.length) {
      const nextFrontier = [] as number[];
      for (const pixIdx of frontier) {
        const x = pixIdx % cell, y = Math.floor(pixIdx / cell);
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nbrX = x + ax, nbrY = y + ay;
          if (nbrX < 0 || nbrY < 0 || nbrX >= cell || nbrY >= cell) continue;
          const q2 = nbrY * cell + nbrX;
          if (from[q2] >= 0) continue;
          from[q2] = from[pixIdx];
          nextFrontier.push(q2);
        }
      }
      frontier = nextFrontier;
    }
    for (let pixIdx = 0; pixIdx < n; pixIdx++) if (t[pixIdx * 4 + 3] === 0 && from[pixIdx] >= 0) for (let channel = 0; channel < 3; channel++) t[pixIdx * 4 + channel] = t[from[pixIdx] * 4 + channel];
  }
  const out = [t];
  for (let size = cell >> 1; size >= 1; size >>= 1) {
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

// 图集：每张贴图占一格，多级纹理每级都按格排（第 k 级每格 格 >> k 像素），格子之间不混色
let atlas: { original: THREE.DataTexture; solid: THREE.DataTexture; rows: number; cols: number; cell: number } | null = null;
export const blockAtlas = () => {
  if (atlas) return atlas;
  const src = png(texUri);
  const cell = src.w;
  if (cell < 16 || (cell & (cell - 1)) !== 0 || src.h % cell !== 0) throw new Error(`方块图集竖条宽 ${src.w}、高 ${src.h}：格边长要是 16 起的 2 的幂、高是它的整数倍（材质包覆盖层见 pipeline/资产/材质包.ts）`);
  // 纯色方块（纯色方块.ts）按 16 一格压色；高清图集不压，不然一格被拆成四块各算各的平均色
  if (flatColorBlocks && cell !== 16) throw new Error(`纯色方块只认 16 像素一格的方块图集，这里是 ${cell}：出纯色参考视频时作品不选高清材质包（材质包.toml 写 "封顶" = 16）`);
  const sheet = flatColorBlocks ? flattenAtlasColors(src, '不分') : src;
  const texCount = sheet.h / cell;
  const cols = colsFor(cell, texCount);
  const rows = Math.ceil(texCount / cols);
  const mk = (solidFill: boolean) => {
    const levels = Array.from({ length: Math.log2(cell) + 1 }, (_, k) => {
      const cellPx = cell >> k;
      return { width: cols * cellPx, height: rows * cellPx, data: new Uint8Array(cols * cellPx * rows * cellPx * 4) };
    });
    for (let texIdx = 0; texIdx < texCount; texIdx++) {
      const mips = buildMips(sheet.px.subarray(texIdx * cell * cell * 4, (texIdx + 1) * cell * cell * 4), solidFill, cell);
      const cx = texIdx % cols, cy = Math.floor(texIdx / cols);
      mips.forEach((mip, k) => {
        const cellPx = cell >> k;
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
  atlas = { original: mk(false), solid: mk(true), rows: rows, cols, cell };
  return atlas;
};

// 贴图号本该是整数，但 Windows 上 D3D11、Vulkan、GL、WARP 插值后都会带一点小数（11-02 实测，Mac 上是整数）。
// 每行第 0 列的贴图往下偏一点就拆到上一行末列（黄花叶 2384 取到白凳子 2383 的边列，成了白棕横纹），所以先取整再拆行列。
// 说明写在模板外：模板里的字会进着色器源码，也就进了段指纹。
export const blockAtlasGlsl = () => {
  const { rows, cols } = blockAtlas();
  return `
vec2 atlasUv(float layer, vec2 f) {
  layer = floor(layer + 0.5);
  vec2 cell = vec2(mod(layer, ${cols}.0), floor(layer / ${cols}.0));
  return (cell + f) / vec2(${cols}.0, ${rows}.0);
}`;
};
