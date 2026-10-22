// 拍立得定格：定格帧那一下闪白、画面停住，然后整张画面缩成一张斜放的拍立得（三边窄白边、下边宽），下白边淡入一行字。
// 2D 自创效果只在本作品用（用户 10-22 定：照片白边、拼图、花瓣这部作品可以用），所以放作品目录、不进 库/。
// 用法：<拍立得 定格帧={…} 字="…" 样式={…} 浮层={歌词等}>{(fs) => 3D、手、聊天}</拍立得>。fs = min(帧, 定格帧)，子画面全按 fs 画，
// 定格以后每帧都重画定格那一刻；浮层不停、不跟着缩，画在照片上面、闪白下面。定格帧由段画面从 分镜.ts 取，这里只数相对定格帧的帧数。
// 缩小是把整张卡片从「画面正好铺满」拉远到最终大小：白边一开始在画外，拉远时自然露出来；外框留在 DOM 里不重挂，ThreeCanvas 不会因此重建。
import type React from 'react';
import { useId } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp01, rad, sample } from '@engine/anim/anim.ts';
import { uiFontFamily } from '@库/界面/基础.tsx';

export type 拍立得样式 = {
  /** 照片里的画面最后缩到原来的几倍（白边另加在外面） */
  缩放: number;
  /** 最后斜几度，负数是逆时针 */
  斜度: number;
  /** 闪白从定格帧起持续几帧（第一帧全白，平方衰减） */
  闪白帧: number;
  /** 从定格帧起缩小、转斜用几帧（缓入缓出） */
  缩小帧: number;
  /** 定格后第几帧起字开始淡入，淡入用几帧 */
  字延迟帧: number;
  字淡入帧: number;
  /** 左、上、右白边，下白边：占画面宽的比例（缩放前） */
  边: number;
  下边: number;
  /** 照片停稳以后字在画面上的像素大小 */
  字号: number;
  字色: string;
  /** 白边的颜色（相纸） */
  相纸: string;
  /** 照片缩小后露出来的底色；纸纹：上面再叠一层很淡的纸张颗粒 */
  背景: string;
  纸纹: boolean;
};

// 投影（缩放前的画面像素，跟着卡片一起缩）：往下错开、模糊，浓度随缩小进度淡入
const 投影 = { 下错: 18, 模糊: 46, 浓度: 0.38 };

const 纸纹: React.FC<{ 色: string }> = ({ 色 }) => {
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
      <rect width="100%" height="100%" fill={色} />
      <rect width="100%" height="100%" filter={`url(#${id})`} />
      {/* 四角压暗一点，像台面上打了灯，照片不至于浮在一片平的颜色上 */}
      <rect width="100%" height="100%" fill={`url(#${id}-vignette)`} />
    </svg>
  );
};

export const 拍立得: React.FC<{
  定格帧: number;
  字?: string;
  样式: 拍立得样式;
  浮层?: React.ReactNode;
  children: (fs: number) => React.ReactNode;
}> = ({ 定格帧, 字, 样式, 浮层, children }) => {
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const fs = Math.min(f, 定格帧);
  const 已定格 = f >= 定格帧;
  const t = f - 定格帧;

  // 进度 p：定格帧是 0，第 缩小帧−1 帧走完
  const p = sample([[0, 0], [Math.max(1, 样式.缩小帧 - 1), 1]], t);
  const k = 1 + (样式.缩放 - 1) * p;
  const θ = 样式.斜度 * p;
  const 边 = 样式.边 * W;
  const 下边 = 样式.下边 * W;
  // 卡片中心比画面中心低 (下边−边)/2；按当前缩放、斜度把它挪回画面中心，p=0 时不挪（画面正好铺满）
  const d = (下边 - 边) / 2;
  const tx = p * k * d * Math.sin(rad(θ));
  const ty = -p * k * d * Math.cos(rad(θ));

  const 闪 = 已定格 && t < 样式.闪白帧 ? (1 - t / 样式.闪白帧) ** 2 : 0;
  const 字透明 = clamp01((t - 样式.字延迟帧 + 1) / Math.max(1, 样式.字淡入帧));

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: 已定格 ? 样式.背景 : undefined }}>
      {已定格 && 样式.纸纹 ? <纸纹 色={样式.背景} /> : null}
      <AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) rotate(${θ}deg) scale(${k})`, transformOrigin: '50% 50%' }}>
        {已定格 ? (
          <div
            style={{
              position: 'absolute',
              left: -边,
              top: -边,
              width: W + 2 * 边,
              height: H + 边 + 下边,
              background: 样式.相纸,
              borderRadius: 边 * 0.12,
              boxShadow: `0 ${投影.下错}px ${投影.模糊}px rgba(0, 0, 0, ${投影.浓度 * p})`,
            }}
          />
        ) : null}
        <AbsoluteFill style={{ overflow: 'hidden' }}>{children(fs)}</AbsoluteFill>
        {已定格 ? (
          // 相片和相纸交界处一圈很细的暗线，像相纸上压出来的画框
          <AbsoluteFill style={{ boxShadow: `inset 0 0 0 ${Math.max(1, W / 1280)}px rgba(0, 0, 0, ${0.12 * p})` }} />
        ) : null}
        {已定格 && 字 ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: H,
              width: W,
              height: 下边,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: uiFontFamily,
              fontSize: 样式.字号 / 样式.缩放,
              letterSpacing: '0.12em',
              color: 样式.字色,
              whiteSpace: 'nowrap',
              opacity: 字透明,
            }}
          >
            {字}
          </div>
        ) : null}
      </AbsoluteFill>
      {浮层}
      {闪 > 0 ? <AbsoluteFill style={{ backgroundColor: '#ffffff', opacity: 闪 }} /> : null}
    </AbsoluteFill>
  );
};
