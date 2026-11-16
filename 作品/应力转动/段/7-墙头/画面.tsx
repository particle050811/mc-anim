// 7-3-1 墙头：整场共用的 ../7-3/画面.tsx 按本段的场时刻和机位画出来；
// 声音照本段 段.ts 的 cue 放（definePicture 自动挂），不再挂 7-3/声音.tsx。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { definePicture } from '@engine/段/段画面.tsx';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { ScenePicture } from '../../场/7-墙头追逐/7-3/画面.tsx';
import * as choreo from '../../场/7-墙头追逐/7-3-1/编排.ts';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

export const C731: React.FC = () => {
  const sec = useCurrentSec();
  const { width, height } = useVideoConfig();
  return <ScenePicture T={choreo.timeAt(sec)} cam={choreo.camera(sec)} width={width} height={height} />;
};
export default definePicture(seg, soundUrl, C731);
