// 侧剖面的机位：三渲二的正交像素机位（engine/三渲二/机位.tsx）朝正北看，画面右边是东；看点放在剖面 y = 0 上，这一层不随俯角挪，
// 往里（+y）每格画面上升 顶面 ÷ N 格（斜投影，画风.ts 的 正交顶面）。场景内容的坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）。
// 像素对齐：取景中心在成片上落在偶数像素（场/2-门口/参数.ts 算好），三渲二机位的吸附就不挪，贴图像素的边都在整像素上。
import type { OrthoRigParams } from '@engine/三渲二/机位.tsx';
import { filmScale } from '@engine/三渲二/像素.ts';

/** 取景：中心 = 画面中心对着的剖面上的 [x, z]（格）；每格 = 一格在成片 2560×1440 上占几个像素（= 16N）；推拉 = N 带小数（同正交机位的 推拉） */
export type SideFraming = { 中心: readonly [number, number]; pxPerCell: number; dolly?: boolean };

/** 侧取景 → 三渲二正交机位参数（给 三渲二画布 的 机位） */
export const sideRig = (framing: SideFraming, topDepth: number): OrthoRigParams => ({
  种: '正交',
  N: framing.pxPerCell / 16,
  ...(framing.dolly ? { dolly: true } : {}),
  topDepth,
  看: [framing.中心[0], 0, framing.中心[1]],
  facing: '北',
});

/** 场景里的点 (x, z, y) → 画布上的页面坐标（左上角原点、y 朝下，页面像素）；给气泡这类 2D 叠层定位。页宽、页高是画布的页面尺寸，顶面同机位 */
export const sideProjection = (framing: SideFraming, pageWidth: number, pageHeight: number, topDepth = 0) => {
  const oblique = topDepth / (framing.pxPerCell / 16);
  return (x: number, z: number, y = 0) => ({
    x: pageWidth / 2 + ((x - framing.中心[0]) * framing.pxPerCell) / filmScale,
    y: pageHeight / 2 - ((z + oblique * y - framing.中心[1]) * framing.pxPerCell) / filmScale,
  });
};
