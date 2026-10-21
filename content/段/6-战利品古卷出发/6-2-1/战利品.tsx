// 6-2-1 战利品：第 2 场基地谋划前三段那条共用时间线上的第一个窗口。戏、时刻、机位在 编排.ts，画面在 画面.tsx，台词和音效在 声音.tsx。
import React from 'react';
import { segmentFrames } from './编排.ts';
import { BasePlanSegment } from './画面.tsx';
import { BasePlanSound } from './声音.tsx';

export const LOOT_FRAMES = segmentFrames('6-2-1');
export const Loot: React.FC = () => (
  <>
    <BasePlanSegment segment="6-2-1" />
    <BasePlanSound segment="6-2-1" />
  </>
);
