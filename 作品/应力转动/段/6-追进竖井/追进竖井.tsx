// 6-3-10 追进竖井：6-3-8、6-3-10 那条共用时间线上的第二个窗口（首帧 = 切坑那一帧，和 6-3-8 末帧硬切）。末帧两人已跳进竖井、卫兵围在坑口，
// 后面接第 4 场 6-4-1（不用接）。戏、时刻、机位在 6-3-8/编排.ts，画面在 6-3-8/画面.tsx，音效在 6-3-8/声音.tsx。
import React from 'react';
import { PursuerSegment } from '../../地点/边城/6-3-8/画面.tsx';
import { PursuerSound } from '../../场/6-边城/6-3-8/声音.tsx';
import { frameCount } from './编排.ts';

export const CHASE_FRAMES = frameCount;
export const ChasePit: React.FC = () => (
  <>
    <PursuerSegment segment="6-3-10" />
    <PursuerSound segment="6-3-10" />
  </>
);
