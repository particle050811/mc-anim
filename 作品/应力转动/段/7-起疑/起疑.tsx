// 7-4-4 起疑（旧 Composition「7-4-4-起疑」）：戏、机位在 编排.ts，画面在 画面实现.tsx；声音照本段 段.ts 的 cue 放，不再挂 声音.tsx。
// 编排的帧是 1/24 秒一格（编排.ts 的 FPS），按秒换算。
import React from 'react';
import { use当前秒 } from '@engine/段/时间.tsx';
import { END, FPS } from './编排.ts';
import { SuspicionPicture } from './画面实现.tsx';

export const suspicionFrameCount = END;
export const Suspicion: React.FC = () => <SuspicionPicture f={use当前秒() * FPS} />;
