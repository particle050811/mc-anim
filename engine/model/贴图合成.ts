// 贴图合成：几张同尺寸的实体贴图从下到上叠成一张（外观变体用：村民的 群系 × 职业 × 等级徽章、盔甲染色层之类）。纯函数，不 import three。
// 按 8 位 sRGB 数值做 source-over。原版是一层层分开画（cutout），每个像素 alpha 只有 0、255 时和合成成一张完全一样；
// 半透明像素原版是两层各自镂空（alpha < 0.1 丢掉），这里是混合，有差别。
import type { Png } from './贴图.ts';

export const 叠贴图 = (层们: readonly Png[]): Png => {
  if (!层们.length) throw new Error('叠贴图：一层都没有');
  const [底, ...上们] = 层们;
  if (!上们.length) return 底!;
  const { w, h } = 底!;
  const px = new Uint8Array(底!.px);
  for (const 上 of 上们) {
    if (上.w !== w || 上.h !== h) throw new Error(`叠贴图：尺寸不一样（${上.w}×${上.h}，底图 ${w}×${h}）`);
    for (let i = 0; i < px.length; i += 4) {
      const a = 上.px[i + 3]!;
      if (a === 0) continue;
      if (a === 255) {
        px.set(上.px.subarray(i, i + 4), i);
        continue;
      }
      const 下a = px[i + 3]!;
      const 出a = a + (下a * (255 - a)) / 255;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round((上.px[i + c]! * a + (px[i + c]! * 下a * (255 - a)) / 255) / 出a);
      px[i + 3] = Math.round(出a);
    }
  }
  return { w, h, px };
};
