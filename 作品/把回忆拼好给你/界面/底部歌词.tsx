// 歌词素字放在画面底部（三稿第 15 句的特例：让人只读她头顶的气泡）。淡入淡出的算法同 歌词.tsx（歌词不透明度），只是位置从下往上量。
// 不改 歌词.tsx：1-一如既往 用它，改了它那段就过期。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { 歌词不透明度, type 歌词样式, type 歌词行 } from './歌词.tsx';

export type 底部歌词样式 = Omit<歌词样式, '顶边'> & {
  /** 字的下沿离画面底几像素（页面像素） */
  底边: number;
};

/** 第 15 句用的样式（Agent 暂定）：字号、颜色、阴影、淡入淡出同 1-一如既往 的顶部歌词（场/1-隐世之境一楼/参数.ts）；
 *  下沿离底 30：左下原版聊天栏（缩放 6）最底一行的下沿在页面 y 600，歌词在 y 650～690，不压聊天字 */
export const 第15句歌词样式: 底部歌词样式 = {
  底边: 30,
  字号: 36,
  颜色: '#ffffff',
  阴影: '0 2px 6px rgba(0, 0, 0, 0.45)',
  淡入帧: 4,
  淡出帧: 5,
};

export const 底部歌词: React.FC<{ 行们: readonly 歌词行[]; 样式: 底部歌词样式; 收?: number }> = ({ 行们, 样式, 收 }) => {
  const f = useCurrentFrame();
  const 透明 = 歌词不透明度(行们, f, 样式, 收);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {行们.map((行, i) =>
        透明[i]! > 0 ? (
          <div
            key={`${i}-${行.词}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 样式.底边,
              textAlign: 'center',
              fontFamily: uiFontFamily,
              fontSize: 样式.字号,
              lineHeight: 1.2,
              letterSpacing: '0.08em',
              color: 样式.颜色,
              textShadow: 样式.阴影,
              whiteSpace: 'nowrap',
              opacity: 透明[i],
            }}
          >
            {行.词}
          </div>
        ) : null,
      )}
    </AbsoluteFill>
  );
};
