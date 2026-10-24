// 整片后期：包住整帧（3D 画布、2D 界面、现实部分一起），盖同一层质感，3D 和 2D 的接缝藏在这一层里（05-画风 原则 4、9）。
// 三层：调色（SVG feColorMatrix，在 sRGB 数值上做，见 调子.ts 的 调色矩阵）→ 暗角（径向渐变压黑）→ 颗粒（feTurbulence 分形噪声，种子默认 = 帧号，叠加混合）。
// 核对段一帧一个视图时给 种子（取片子里那一帧的帧号），各视图的颗粒才一样，逐像素比只差要比的那个变量。
// 参数是调子里的 调色，从作品的色板取；不给 = 原样输出（核对时对比用）。
// 颗粒让开（可选）：这几块不盖颗粒（页面像素的矩形），给要逐像素看清的小字用（告示牌上的字，用户 10-24：「整片后期的颗粒别压在字上」）。
import React, { useId } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 调色矩阵, type 调色 } from './调子.ts';

/** 颗粒的空间频率（每 CSS 像素几个周期）：噪声斑点约 1.5 个 CSS 像素、成片上 3 个像素 */
const 颗粒频率 = 0.65;
// 噪声取灰度、绕 0.5 拉开 2 倍，alpha 置 1（分形噪声的 alpha 也是噪声，不置 1 会透）
const 颗粒矩阵 = [...[0, 1, 2].flatMap(() => [2 / 3, 2 / 3, 2 / 3, 0, -0.5]), 0, 0, 0, 0, 1].join(' ');

export type 页面矩形 = { 左: number; 上: number; 宽: number; 高: number };

/** 整页挖掉这几块的裁剪路径（evenodd：外框一圈、每块一圈） */
const 挖空路径 = (块们: readonly 页面矩形[]) =>
  `path(evenodd, '${['M-1 -1 H100000 V100000 H-1 Z', ...块们.map((r) => `M${r.左} ${r.上} h${r.宽} v${r.高} h${-r.宽} Z`)].join(' ')}')`;

export const 整片后期: React.FC<{ 调色?: 调色 | null; 种子?: number; 颗粒让开?: readonly 页面矩形[]; children: React.ReactNode }> = ({ 调色: t, 种子, 颗粒让开, children }) => {
  const 帧 = useCurrentFrame();
  const frame = 种子 ?? 帧;
  const id = `grade${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  if (!t) return <AbsoluteFill>{children}</AbsoluteFill>;
  return (
    <AbsoluteFill>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={调色矩阵(t).join(' ')} />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: `url(#${id})` }}>{children}</AbsoluteFill>
      {t.暗角 > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse farthest-corner at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,${t.暗角}) 100%)` }} />}
      {t.颗粒 > 0 && (
        <AbsoluteFill style={{ mixBlendMode: 'overlay', opacity: t.颗粒, ...(颗粒让开?.length ? { clipPath: 挖空路径(颗粒让开) } : {}) }}>
          <svg width="100%" height="100%">
            <filter id={`${id}n`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency={颗粒频率} numOctaves={1} seed={frame} stitchTiles="noStitch" />
              <feColorMatrix type="matrix" values={颗粒矩阵} />
            </filter>
            <rect width="100%" height="100%" filter={`url(#${id}n)`} />
          </svg>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
