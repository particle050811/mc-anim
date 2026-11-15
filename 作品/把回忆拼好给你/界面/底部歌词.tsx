// 歌词素字放在画面底部（三稿第 15 句的特例：让人只读她头顶的气泡）。淡入淡出的算法同 歌词.tsx（歌词不透明度），只是位置从下往上量。
// 不改 歌词.tsx：1-一如既往 用它，改了它那段就过期。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { legacyFrameSec } from '../分镜/时间.ts';
import { lyricOpacity, type LyricStyle, type LyricLine } from './歌词.tsx';
import { useSnappedFrame } from '../当前帧.ts';

export type BottomLyricStyle = Omit<LyricStyle, 'topEdge'> & {
  /** 字的下沿离画面底几像素（页面像素） */
  bottomEdge: number;
};

/** 第 15 句用的样式（Agent 暂定）：字号、颜色、阴影、淡入淡出（24 fps 时 4、5 帧）同 1-一如既往 的顶部歌词（场/1-隐世之境一楼/参数.ts）；
 *  下沿离底 30：左下原版聊天栏（缩放 6）最底一行的下沿在页面 y 600，歌词在 y 650～690，不压聊天字 */
export const line15LyricStyle: BottomLyricStyle = {
  bottomEdge: 30,
  字号: 36,
  颜色: '#ffffff',
  textShadow: '0 2px 6px rgba(0, 0, 0, 0.45)',
  fadeInSec: legacyFrameSec(4),
  fadeOutSec: legacyFrameSec(5),
};

export const bottomLyric: React.FC<{ lines: readonly LyricLine[]; 样式: BottomLyricStyle; 收?: number }> = ({ lines, 样式: bottomLyricStyle, 收: fadeOutFrame }) => {
  const f = useSnappedFrame();
  const alpha = lyricOpacity(lines, f, bottomLyricStyle, fadeOutFrame);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {lines.map((lyricLine, i) =>
        alpha[i]! > 0 ? (
          <div
            key={`${i}-${lyricLine.text}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: bottomLyricStyle.bottomEdge,
              textAlign: 'center',
              fontFamily: uiFontFamily,
              fontSize: bottomLyricStyle.字号,
              lineHeight: 1.2,
              letterSpacing: '0.08em',
              color: bottomLyricStyle.颜色,
              textShadow: bottomLyricStyle.textShadow,
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
