// 7-4-4 起疑（旧 Composition「7-4-4-起疑」）：戏、机位在 编排.ts，画面在 画面实现.tsx；声音照本段 段.ts 的 cue 放，不再挂 声音.tsx。
import React from 'react';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { SuspicionPicture } from './画面实现.tsx';
export const Suspicion: React.FC = () => <SuspicionPicture sec={useCurrentSec()} />;
