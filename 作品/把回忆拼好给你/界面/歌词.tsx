// 歌词字幕：顶部居中一行。每句从入帧起淡入；下一句入帧时它用一半的时长先退掉（两句在同一位置，等长交叉会叠成一团），最后一句在 收 那帧起淡出。
// 画在段画面里（不走台词 cue、不做 film 叠层），静帧、预览看到的就是成片。
// 入帧、收帧由段画面从 分镜 取段内帧传进来（每句的开口、咔哒定格），样式从场的 参数.ts 传进来，这里不写帧号。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { clamp01 } from '@engine/anim/anim.ts';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { fps, oneFrameSec } from '../分镜/时间.ts';
import { useSnappedFrame } from '../当前帧.ts';

/** 一句：入 = 从这一段内帧起淡入 */
export type LyricLine = { text: string; 入: number };

export type LyricStyle = {
  /** 字的上沿离画面顶几像素 */
  topEdge: number;
  字号: number;
  颜色: string;
  /** CSS text-shadow */
  textShadow: string;
  /** 每句淡入用几秒（换句时旧句用它的一半退掉） */
  fadeInSec: number;
  /** 最后一句在 收 处淡出用几秒 */
  fadeOutSec: number;
};

/** 从 起 那一帧开始、n秒 走完的渐变：起那一帧已经走了一帧（第 0 帧就看得见，不白占一帧；原来走了 1/24 秒，用户 11-03「统统改成 60 帧」）。
 *  起 是分镜事件的整数帧，起之前一律是 0 */
const fadeRamp = (f: number, startFrame: number, rampSec: number) => (f < startFrame ? 0 : clamp01(((f - startFrame) / fps + oneFrameSec) / Math.max(oneFrameSec, rampSec)));

/** 第 f 帧每句的不透明度（和 行们 同序；行们 要按 入 从早到晚排）。没有 收 时最后一句一直留着 */
export const lyricOpacity = (lines: readonly LyricLine[], f: number, lyricStyle: Pick<LyricStyle, 'fadeInSec' | 'fadeOutSec'>, fadeOutFrame?: number): number[] =>
  lines.map((lyricLine, i) => {
    const nextLine = lines[i + 1];
    const fadeIn = fadeRamp(f, lyricLine.入, lyricStyle.fadeInSec);
    // 原来是 ceil(淡入帧 / 2) 帧；用到的淡入都是 24 fps 偶数帧，一半正好
    const fadeOut = nextLine ? fadeRamp(f, nextLine.入, lyricStyle.fadeInSec / 2) : fadeOutFrame === undefined ? 0 : fadeRamp(f, fadeOutFrame, lyricStyle.fadeOutSec);
    return fadeIn * (1 - fadeOut);
  });

export const Lyrics: React.FC<{ lines: readonly LyricLine[]; 样式: LyricStyle; 收?: number }> = ({ lines, 样式: lyricStyle, 收: fadeOutFrame }) => {
  const f = useSnappedFrame();
  for (let i = 1; i < lines.length; i++) if (lines[i].入 < lines[i - 1].入) throw new Error(`歌词「${lines[i].text}」的入帧比上一句早`);
  const alpha = lyricOpacity(lines, f, lyricStyle, fadeOutFrame);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {lines.map((lyricLine, i) =>
        alpha[i] > 0 ? (
          <div
            key={`${i}-${lyricLine.text}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: lyricStyle.topEdge,
              textAlign: 'center',
              fontFamily: uiFontFamily,
              fontSize: lyricStyle.字号,
              lineHeight: 1.2,
              letterSpacing: '0.08em',
              color: lyricStyle.颜色,
              textShadow: lyricStyle.textShadow,
              whiteSpace: 'nowrap',
              opacity: alpha[i],
            }}
          >
            {lyricLine.text}
          </div>
        ) : null,
      )}
    </AbsoluteFill>
  );
};
