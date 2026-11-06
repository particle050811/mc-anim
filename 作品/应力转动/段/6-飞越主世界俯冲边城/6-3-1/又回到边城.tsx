// 6-3-1 又回到边城：6-3 下坠（镜头/6-3-下坠/）这条共用时间线上 6-3-2 前面的窗口（负的全局帧）。戏和机位在 编排.ts，画面在 6-3-下坠/画面.tsx。
// 声音（三句台词、飞行配乐 Wasted 的尾巴：从 6-2-6 末帧接着放，悬停起三小节渐弱到第 169 帧无声）照 6-飞越主世界俯冲边城 段.ts 的 cue 放（定义画面 自动挂）。
import React from 'react';
import { FallSegment } from '../../../场/6-边城/6-3-下坠/画面.tsx';
import { 段帧数 } from '../../../地点/边城/6-3-下坠/时间线.ts';

export const BackToBorderTown_FRAMES = 段帧数('6-3-1');
export const BackToBorderTown: React.FC = () => <FallSegment segment="6-3-1" />;
