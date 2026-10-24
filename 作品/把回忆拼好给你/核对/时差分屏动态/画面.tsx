// 时差分屏动态核对的画面：第 f 帧画歌曲帧 起帧 + f（场/2-门口/时差分屏.tsx）。
// 坑：不能像 核对/时差分屏 那样包 <Freeze frame={歌曲帧}>：渲视频时三渲二画布（three）就停在第一帧不动了，只有 2D 的天在走（静帧一张一张渲看不出来）。
// 所以颗粒的种子是段内帧，生长三那一帧和 核对-时差分屏 的定稿只差颗粒。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 时差分屏 } from '../../场/2-门口/时差分屏.tsx';
import { 窗口 } from './窗口.ts';

const 画面: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <时差分屏 帧={窗口.起帧 + useCurrentFrame()} />
  </AbsoluteFill>
);

export default 画面;
