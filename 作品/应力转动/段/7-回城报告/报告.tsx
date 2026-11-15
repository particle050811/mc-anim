// 7-4-3 报告（旧 Composition「7-4-3-报告」）：戏、机位在 场/7-收场/7-4-3/编排.ts，画面在 场/7-收场/7-4-3/画面.tsx；声音照本段 段.ts 的 cue 放，不再挂 声音.tsx。
// 编排的帧是 1/24 秒一格（编排.ts 的 FPS），按秒换算。
import React from 'react';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { FPS } from '../../场/7-收场/7-4-3/编排.ts';
import { ReportPicture } from '../../场/7-收场/7-4-3/画面.tsx';
export const Report: React.FC = () => <ReportPicture f={useCurrentSec() * FPS} />;
