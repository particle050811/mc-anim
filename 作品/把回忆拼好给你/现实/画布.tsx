// 现实部分的画布：三渲二画布（平涂、正交侧剖面机位朝北、描边），像素 N、俯角、描边宽和分屏另一半的门口同一套（默认照 画风.ts，分屏给 分屏N），调子默认色板「现实」。
// 场景内容放 children（第 13 句的现实课桌，第 14 句的楼下）；整片后期在外面包。
import type React from 'react';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import type { ShadingOptions } from '@engine/三渲二/光影/预设.ts';
import type { Tone } from '@engine/三渲二/调子.ts';
import { sideRig, type SideFraming } from '../地点/侧剖面.tsx';
import { outline as defaultOutline, orthoTop } from '../画风.ts';
import { palette, type ToneName } from '../色板.ts';

/** 场景没盖住的地方（不该露出来，露了也是暗的） */
const baseColor = '#1b2027';

export type RealCanvasProps = {
  /** 画布的页面尺寸（成片 scale 2），要偶数 */
  宽: number;
  高: number;
  /** 取景：中心 = 画面中心对着剖面 y = 0 上的 [x, z]（格），每格 = 16N 成片像素 */
  framing: SideFraming;
  tone?: ToneName | Tone;
  /** 描边开关（默认照 画风.ts） */
  outline?: boolean;
  /** 描边宽（成片像素）：默认 画风.ts 的 6（N = 6 时一个贴图像素）；取景换了 N 的给 N，线还是一个贴图像素宽 */
  outlineWidth?: number;
  /** 斜投影俯角（成片像素，0～N 的偶数）：默认 画风.ts 的 正交顶面 */
  topDepth?: number;
  /** 场景后面的底色：默认是不该露出来的暗底；第 14 句楼下给天色 */
  天?: string;
  /** 光影（段里传 默认.ts 的 光影段）；不给 = 不开 */
  shading?: ShadingOptions | null;
  children: React.ReactNode;
};

export const RealCanvas: React.FC<RealCanvasProps> = ({ 宽: width, 高: height, framing, tone: tone = '现实', outline = defaultOutline.开, outlineWidth = defaultOutline.宽, topDepth = orthoTop, 天: sky = baseColor, shading, children }) => {
  const t = typeof tone === 'string' ? palette[tone] : tone;
  return (
    <ToonCanvas 宽={width} 高={height} cameraRig={sideRig(framing, topDepth)} 天={sky} tint={t.tint} outline={outline ? { 宽: outlineWidth, 色: t.outlineColor } : false} shading={shading}>
      {children}
    </ToonCanvas>
  );
};
