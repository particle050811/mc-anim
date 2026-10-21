// 6-3-1 又回到边城：6-3 下坠（镜头/6-3-下坠/）这条共用时间线上 6-3-2 前面的窗口（负的全局帧）。戏和机位在 编排.ts，画面在 6-3-下坠/画面.tsx。
import React from 'react';
import { FallSegment } from '../../../场/6-边城/6-3-下坠/画面.tsx';
import { 段帧数 } from '../../../../world/地点/边城/6-3-下坠/时间线.ts';
import { BackToTownSound } from './声音.tsx';

export const BackToBorderTown_FRAMES = 段帧数('6-3-1');
// 声音（台词、飞行配乐的尾巴）见 声音.tsx
export const BackToBorderTown: React.FC = () => (
  <>
    <FallSegment segment="6-3-1" />
    <BackToTownSound />
  </>
);
