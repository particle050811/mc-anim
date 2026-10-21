// 6-3-8 二人登场：6-3-8、6-3-10 那条共用时间线上的第一个窗口（首帧接 6-3-6 末帧是硬切：6-3-6 停在古城里，这里回到地面）。
// 卫兵看坑 → 黄叛「上次抢劫我们城市的家伙又来了，我们快追！」→ 一齐出发（两人和卫兵先后从走道内沿跳进墙脚的落水池），切坑前一帧为止。
// 戏、时刻、机位在 6-3-8/编排.ts，画面在 6-3-8/画面.tsx，台词和音效在 6-3-8/声音.tsx。
import React from 'react';
import { segmentFrames } from '../../../world/地点/边城/6-3-8/编排.ts';
import { PursuerSegment } from '../../../world/地点/边城/6-3-8/画面.tsx';
import { PursuerSound } from '../../场/6-边城/6-3-8/声音.tsx';

export const MEET_FRAMES = segmentFrames('6-3-8');
export const TwoArrive: React.FC = () => (
  <>
    <PursuerSegment segment="6-3-8" />
    <PursuerSound segment="6-3-8" />
  </>
);
