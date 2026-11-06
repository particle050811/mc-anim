// 7-1-2 恼鬼与火把：整场共用的 ../7-1/画面.tsx 按本段的场时刻和机位画出来。原生段（段.ts 写了 时钟: '秒'），声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { 定义画面 } from '@engine/段/段画面.tsx';
import { use当前秒 } from '@engine/段/时间.tsx';
import { ScenePicture } from '../../地点/古城4x/7-1/画面.tsx';
import * as choreo from './编排.ts';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

export const c712FrameCount = choreo.END;
export const C712: React.FC = () => {
  const frame = use当前秒() * choreo.FPS; // 段内第几格（1/24 秒一格，带小数）
  const { width, height } = useVideoConfig();
  return <ScenePicture t={choreo.t于(frame)} cam={choreo.camera(frame)} width={width} height={height} />;
};
export default 定义画面(段, 声音地址, C712);
