// 拍立得定格：定格帧那一下闪白、画面停住，然后整张画面缩成一张斜放的拍立得（三边窄白边、下边宽），下白边淡入一行字。
// 2D 自创效果只在本作品用（用户 10-22 定：照片白边、拼图、花瓣这部作品可以用），所以放作品目录、不进 库/。
// 用法：<拍立得 定格帧={…} 字="…" 样式={…} 浮层={歌词等}>{(fs) => 3D、手、聊天}</拍立得>。fs = min(帧, 定格帧)，子画面全按 fs 画，
// 定格以后每帧都重画定格那一刻；浮层不停、不跟着缩，画在照片上面、闪白下面。定格帧由段画面从 分镜 取，这里只数离定格帧几秒。
// 缩小是把整张卡片从「画面正好铺满」拉远到最终大小：白边一开始在画外，拉远时自然露出来；外框留在 DOM 里不重挂，ThreeCanvas 不会因此重建。
import type React from 'react';
import { useId } from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { clamp01, rad, sample } from '@engine/anim/anim.ts';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { fps, oneFrameSec } from '../分镜/时间.ts';
import { useSnappedFrame } from '../当前帧.ts';

export type PolaroidStyle = {
  /** 照片里的画面最后缩到原来的几倍（白边另加在外面） */
  缩放: number;
  /** 最后斜几度，负数是逆时针 */
  tiltDeg: number;
  /** 闪白从定格帧起持续几秒（定格那一下全白，平方衰减） */
  whiteFlashSec: number;
  /** 从定格帧起缩小、转斜用几秒（缓入缓出） */
  shrinkSec: number;
  /** 定格后几秒起字开始淡入，淡入用几秒 */
  textDelaySec: number;
  textFadeInSec: number;
  /** 左、上、右白边，下白边：占画面宽的比例（缩放前） */
  borderWidth: number;
  bottomEdge: number;
  /** 照片停稳以后字在画面上的像素大小 */
  字号: number;
  textColor: string;
  /** 白边的颜色（相纸） */
  photoPaper: string;
  /** 照片缩小后露出来的底色；纸纹：上面再叠一层很淡的纸张颗粒 */
  background: string;
  paperGrain: boolean;
};

// 投影（缩放前的画面像素，跟着卡片一起缩）：往下错开、模糊，浓度随缩小进度淡入。第 11 句的拍立得（场/2-门口/门口之夜照片.tsx）也取这一份
export const polaroidShadow = { shadowDrop: 18, shadowBlur: 46, density: 0.38 };

const PaperGrain: React.FC<{ 色: string }> = ({ 色: color }) => {
  // useId 在 React 19 里会带非字母数字的符号，url(#…) 里只留 ASCII 安全字符
  const id = `paper${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
      <filter id={id} x="0" y="0" width="100%" height="100%">
        {/* 固定 seed 的分形噪声：逐帧、逐机器一样，不用 Math.random */}
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} seed={7} stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.27  0 0 0 0 0.2  0 0 0 0.24 0" />
      </filter>
      <radialGradient id={`${id}-vignette`} cx="50%" cy="45%" r="75%">
        <stop offset="55%" stopColor="#000" stopOpacity={0} />
        <stop offset="100%" stopColor="#000" stopOpacity={0.12} />
      </radialGradient>
      <rect width="100%" height="100%" fill={color} />
      <rect width="100%" height="100%" filter={`url(#${id})`} />
      {/* 四角压暗一点，像台面上打了灯，照片不至于浮在一片平的颜色上 */}
      <rect width="100%" height="100%" fill={`url(#${id}-vignette)`} />
    </svg>
  );
};

export const Polaroid: React.FC<{
  freezeFrame: number;
  字?: string;
  样式: PolaroidStyle;
  overlay?: React.ReactNode;
  children: (fs: number) => React.ReactNode;
}> = ({ freezeFrame, 字: text, 样式: polaroidStyle, overlay, children }) => {
  const f = useSnappedFrame();
  const { width: W, height: H } = useVideoConfig();
  const fs = Math.min(f, freezeFrame);
  const isFrozen = f >= freezeFrame;
  const t = (f - freezeFrame) / fps;

  // 进度 p：定格帧是 0，比 缩小秒 早一帧走完
  const p = sample([[0, 0], [Math.max(oneFrameSec, polaroidStyle.shrinkSec - oneFrameSec), 1]], t);
  const k = 1 + (polaroidStyle.缩放 - 1) * p;
  const θ = polaroidStyle.tiltDeg * p;
  const borderWidth = polaroidStyle.borderWidth * W;
  const bottomEdge = polaroidStyle.bottomEdge * W;
  // 卡片中心比画面中心低 (下边−边)/2；按当前缩放、斜度把它挪回画面中心，p=0 时不挪（画面正好铺满）
  const d = (bottomEdge - borderWidth) / 2;
  const tx = p * k * d * Math.sin(rad(θ));
  const ty = -p * k * d * Math.cos(rad(θ));

  const flash = isFrozen && t < polaroidStyle.whiteFlashSec ? (1 - t / polaroidStyle.whiteFlashSec) ** 2 : 0;
  // 淡入那一刻已经走了一帧；那一刻之前截成 0
  const textOpacity = t < polaroidStyle.textDelaySec ? 0 : clamp01((t - polaroidStyle.textDelaySec + oneFrameSec) / Math.max(oneFrameSec, polaroidStyle.textFadeInSec));

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: isFrozen ? polaroidStyle.background : undefined }}>
      {isFrozen && polaroidStyle.paperGrain ? <PaperGrain 色={polaroidStyle.background} /> : null}
      <AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) rotate(${θ}deg) scale(${k})`, transformOrigin: '50% 50%' }}>
        {isFrozen ? (
          <div
            style={{
              position: 'absolute',
              left: -borderWidth,
              top: -borderWidth,
              width: W + 2 * borderWidth,
              height: H + borderWidth + bottomEdge,
              background: polaroidStyle.photoPaper,
              borderRadius: borderWidth * 0.12,
              boxShadow: `0 ${polaroidShadow.shadowDrop}px ${polaroidShadow.shadowBlur}px rgba(0, 0, 0, ${polaroidShadow.density * p})`,
            }}
          />
        ) : null}
        <AbsoluteFill style={{ overflow: 'hidden' }}>{children(fs)}</AbsoluteFill>
        {isFrozen ? (
          // 相片和相纸交界处一圈很细的暗线，像相纸上压出来的画框
          <AbsoluteFill style={{ boxShadow: `inset 0 0 0 ${Math.max(1, W / 1280)}px rgba(0, 0, 0, ${0.12 * p})` }} />
        ) : null}
        {isFrozen && text ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: H,
              width: W,
              height: bottomEdge,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: uiFontFamily,
              fontSize: polaroidStyle.字号 / polaroidStyle.缩放,
              letterSpacing: '0.12em',
              color: polaroidStyle.textColor,
              whiteSpace: 'nowrap',
              opacity: textOpacity,
            }}
          >
            {text}
          </div>
        ) : null}
      </AbsoluteFill>
      {overlay}
      {flash > 0 ? <AbsoluteFill style={{ backgroundColor: '#ffffff', opacity: flash }} /> : null}
    </AbsoluteFill>
  );
};
