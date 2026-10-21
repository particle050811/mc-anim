// 纯色方块：方块网格（lib/方块网格.tsx）和体素世界（lib/真实方块图集.ts）共用。
import { getInputProps } from 'remotion';
import type { Png } from '../model/贴图.ts';

// 纯色方块（渲染参数 --props='{"纯色方块":true}'）：图集里每张 16×16 贴图换成它不透明像素的平均色。
// 给 AI 视频模型的参考视频用（用户 2026-10-13）：贴图太像游戏时模型照抄参考视频的画面，压成纯色后材质细节只能照写实关键帧去补
export const flatColorBlocks = Boolean((getInputProps() as { 纯色方块?: boolean }).纯色方块);
// 层：'花草' = 方块网格的 plants 层（草、蕨这类灰色贴图整张抠掉，不管透明多少；花保留轮廓、不补实）；
// '其他' = 方块网格的其余各层（大半不透明的补成实心，不抠）；'不分' = 体素世界（一张图集各层共用，补实和去草都按透明多少分）
export const flattenAtlasColors = (atlas: Png, layer: '花草' | '其他' | '不分'): Png => {
  const px = new Uint8Array(atlas.px);
  for (let ty = 0; ty < atlas.h; ty += 16)
    for (let tx = 0; tx < atlas.w; tx += 16) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let alphaSum = 0;
      for (let y = ty; y < Math.min(ty + 16, atlas.h); y++)
        for (let x = tx; x < Math.min(tx + 16, atlas.w); x++) {
          const i = (y * atlas.w + x) * 4;
          const alpha = px[i + 3] / 255;
          sumR += px[i] * alpha;
          sumG += px[i + 1] * alpha;
          sumB += px[i + 2] * alpha;
          alphaSum += alpha;
        }
      if (alphaSum === 0) continue;
      // 树叶这类大半不透明的镂空贴图，小孔本身就是像素花纹，补成实心；花草这种大半透明的保留轮廓
      const mostlyOpaque = alphaSum > (Math.min(16, atlas.w - tx) * Math.min(16, atlas.h - ty)) / 2;
      const isGray = Math.max(sumR, sumG, sumB) - Math.min(sumR, sumG, sumB) < 0.08 * Math.max(sumR, sumG, sumB);
      const fillSolid = layer !== '花草' && mostlyOpaque;
      // 地上的草（用户 2026-10-13 要去掉）：草、蕨的贴图是灰的（靠顶点色染绿），花是彩色的，所以大半透明又是灰色的整张抠掉，花留着
      const removeGrass = isGray && (layer === '花草' || (layer === '不分' && !mostlyOpaque));
      for (let y = ty; y < Math.min(ty + 16, atlas.h); y++)
        for (let x = tx; x < Math.min(tx + 16, atlas.w); x++) {
          const i = (y * atlas.w + x) * 4;
          px[i] = sumR / alphaSum;
          px[i + 1] = sumG / alphaSum;
          px[i + 2] = sumB / alphaSum;
          if (fillSolid) px[i + 3] = 255;
          if (removeGrass) px[i + 3] = 0;
        }
    }
  return { w: atlas.w, h: atlas.h, px };
};
