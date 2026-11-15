// 7-3-3 音波：整场共用的 ../7-3/画面.tsx 按本段的变速和机位画出来（同 ../7-1/变速段.tsx 的画面那半：t = 变速.剧情时间(帧)）。
// 编排、变速里的帧是 1/24 秒一格（7-3/时间线.ts 的 FPS），按秒换算。本场收在这里、硬切 7-4-1；声音（连段尾淡掉）照本段 段.ts 的 cue 放（定义画面 自动挂），不再走 变速段 的音轨。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { definePicture } from '@engine/段/段画面.tsx';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { ScenePicture } from '../../场/7-墙头追逐/7-3/画面.tsx';
import * as choreo from '../../场/7-墙头追逐/7-3-3/编排.ts';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

export const c733FrameCount = choreo.END;
export const C733: React.FC = () => {
  const frame = useCurrentSec() * choreo.FPS;
  const { width, height } = useVideoConfig();
  return <ScenePicture T={choreo.timeAt(frame)} cam={choreo.camera(frame)} width={width} height={height} />;
};
export default definePicture(seg, soundUrl, C733);
