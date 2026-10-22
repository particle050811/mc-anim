// 6-3-4 城防：6-3 下坠（镜头/6-3-下坠/）这条一镜到底的时间线上的一个窗口。戏、时钟、机位在 6-3-下坠/编排.ts、时间线.ts，画面在 画面.tsx。
import React from 'react';
import { FallSegment } from '../../场/6-边城/6-3-下坠/画面.tsx';
import { 段帧数 } from '../../地点/边城/6-3-下坠/时间线.ts';
import { FallSound } from '../../场/6-边城/6-3-下坠/声音.tsx';

export const CityWatch_FRAMES = 段帧数('6-3-4');
// 声音（风、望远镜、砸地、碎方块、台词）排在下坠那条时间线上，每段放自己那一截：见 6-3-下坠/声音.tsx
export const CityWatch: React.FC = () => (
  <>
    <FallSegment segment="6-3-4" />
    <FallSound segment="6-3-4" />
  </>
);
