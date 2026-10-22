// 歌词字幕：顶部居中一行。每句从入帧起淡入；下一句入帧时它用一半的帧数先退掉（两句在同一位置，等长交叉会叠成一团），最后一句在 收 那帧起淡出。
// 画在段画面里（不走台词 cue、不做 film 叠层），静帧、预览看到的就是成片。
// 入帧、收帧由段画面从 分镜.ts 取段内帧传进来（每句的开口、咔哒定格），样式从场的 参数.ts 传进来，这里不写帧号。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { clamp01 } from '@engine/anim/anim.ts';
import { uiFontFamily } from '@库/界面/基础.tsx';

/** 一句：入 = 从这一段内帧起淡入 */
export type 歌词行 = { 词: string; 入: number };

export type 歌词样式 = {
  /** 字的上沿离画面顶几像素 */
  顶边: number;
  字号: number;
  颜色: string;
  /** CSS text-shadow */
  阴影: string;
  /** 每句淡入用几帧（换句时旧句用它的一半退掉） */
  淡入帧: number;
  /** 最后一句在 收 处淡出用几帧 */
  淡出帧: number;
};

/** 从 起 那一帧开始的 n 帧渐变：起那一帧已经走了 1/n，第 n 帧走完（第 0 帧就看得见，不白占一帧） */
const 渐 = (f: number, 起: number, n: number) => clamp01((f - 起 + 1) / Math.max(1, n));

/** 第 f 帧每句的不透明度（和 行们 同序；行们 要按 入 从早到晚排）。没有 收 时最后一句一直留着 */
export const 歌词不透明度 = (行们: readonly 歌词行[], f: number, 样式: Pick<歌词样式, '淡入帧' | '淡出帧'>, 收?: number): number[] =>
  行们.map((行, i) => {
    const 下一句 = 行们[i + 1];
    const 进 = 渐(f, 行.入, 样式.淡入帧);
    const 出 = 下一句 ? 渐(f, 下一句.入, Math.ceil(样式.淡入帧 / 2)) : 收 === undefined ? 0 : 渐(f, 收, 样式.淡出帧);
    return 进 * (1 - 出);
  });

export const 歌词: React.FC<{ 行们: readonly 歌词行[]; 样式: 歌词样式; 收?: number }> = ({ 行们, 样式, 收 }) => {
  const f = useCurrentFrame();
  for (let i = 1; i < 行们.length; i++) if (行们[i].入 < 行们[i - 1].入) throw new Error(`歌词「${行们[i].词}」的入帧比上一句早`);
  const 透明 = 歌词不透明度(行们, f, 样式, 收);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {行们.map((行, i) =>
        透明[i] > 0 ? (
          <div
            key={`${i}-${行.词}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 样式.顶边,
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
