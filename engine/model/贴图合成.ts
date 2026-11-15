// 贴图合成：几张同尺寸的实体贴图从下到上叠成一张（外观变体用：村民的 群系 × 职业 × 等级徽章、盔甲染色层之类）。纯函数，不 import three。
// 按 8 位 sRGB 数值做 source-over。原版是一层层分开画（cutout），每个像素 alpha 只有 0、255 时和合成成一张完全一样；
// 半透明像素原版是两层各自镂空（alpha < 0.1 丢掉），这里是混合，有差别。
import type { Png } from './贴图.ts';

export const overlayTextures = (layers: readonly Png[]): Png => {
  if (!layers.length) throw new Error('叠贴图：一层都没有');
  const [bottomLayer, ...upperLayers] = layers;
  if (!upperLayers.length) return bottomLayer!;
  const { w, h } = bottomLayer!;
  const px = new Uint8Array(bottomLayer!.px);
  for (const overlay of upperLayers) {
    if (overlay.w !== w || overlay.h !== h) throw new Error(`叠贴图：尺寸不一样（${overlay.w}×${overlay.h}，底图 ${w}×${h}）`);
    for (let i = 0; i < px.length; i += 4) {
      const a = overlay.px[i + 3]!;
      if (a === 0) continue;
      if (a === 255) {
        px.set(overlay.px.subarray(i, i + 4), i);
        continue;
      }
      const lowerAlpha = px[i + 3]!;
      const outAlpha = a + (lowerAlpha * (255 - a)) / 255;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round((overlay.px[i + c]! * a + (px[i + c]! * lowerAlpha * (255 - a)) / 255) / outAlpha);
      px[i + 3] = Math.round(outAlpha);
    }
  }
  return { w, h, px };
};
