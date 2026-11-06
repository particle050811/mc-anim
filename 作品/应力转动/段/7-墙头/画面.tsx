// 7-3-1 墙头：整场共用的 ../7-3/画面.tsx 按本段的场时刻和机位画出来；
// 编排里的帧是 1/24 秒一格（7-3/时间线.ts 的 FPS），按秒换算。声音照本段 段.ts 的 cue 放（定义画面 自动挂），不再挂 7-3/声音.tsx。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { 定义画面 } from '@engine/段/段画面.tsx';
import { use当前秒 } from '@engine/段/时间.tsx';
import { ScenePicture } from '../../场/7-墙头追逐/7-3/画面.tsx';
import * as choreo from '../../场/7-墙头追逐/7-3-1/编排.ts';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

export const c731FrameCount = choreo.END;
export const C731: React.FC = () => {
  const frame = use当前秒() * choreo.FPS;
  const { width, height } = useVideoConfig();
  return <ScenePicture T={choreo.T于(frame)} cam={choreo.camera(frame)} width={width} height={height} />;
};
export default 定义画面(段, 声音地址, C731);
