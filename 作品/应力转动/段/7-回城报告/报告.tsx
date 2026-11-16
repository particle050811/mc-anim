// 7-4-3 报告（旧 Composition「7-4-3-报告」）：戏、机位在 场/7-收场/7-4-3/编排.ts，画面在 场/7-收场/7-4-3/画面.tsx；声音照本段 段.ts 的 cue 放，不再挂 声音.tsx。
import React from 'react';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { ReportPicture } from '../../场/7-收场/7-4-3/画面.tsx';
export const Report: React.FC = () => <ReportPicture sec={useCurrentSec()} />;
