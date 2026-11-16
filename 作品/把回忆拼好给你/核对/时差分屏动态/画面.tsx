// 时差分屏动态核对的画面：第 f 帧画歌曲帧 起帧 + f（场/2-门口/时差分屏.tsx）。
// 坑：不能像 核对/时差分屏 那样包 <Freeze frame={歌曲帧}>：渲视频时三渲二画布（three）就停在第一帧不动了，只有 2D 的天在走（静帧一张一张渲看不出来）。
// 所以颗粒的种子是段内帧，生长三那一帧和 核对-时差分屏 的定稿只差颗粒。原声由 definePicture 照 段.ts 的 cue 放。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { TimeLagSplit } from '../../场/2-门口/时差分屏.tsx';
import { frameWindow } from './窗口.ts';
import { useSnappedFrame } from '../../当前帧.ts';

const picture: React.FC = () => {
  const f = useSnappedFrame();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <TimeLagSplit frame={frameWindow.起帧 + f} seed={f} />
    </AbsoluteFill>
  );
};

export default definePicture(seg, soundUrl, picture);
