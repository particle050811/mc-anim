// 6-3-3 俯冲：6-3 下坠（镜头/6-3-下坠/）这条共用时间线上的一个窗口，从思索推近接上来（用户 10-19），到切城墙为止。
// 戏、时钟、机位在 6-3-下坠/编排.ts、时间线.ts，画面在 画面.tsx；开头 `淡出帧数` 帧上面还叠着淡掉的思索层（6-3-2/转场.ts）。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FallSegment } from '../../../场/6-边城/6-3-下坠/画面.tsx';
import { 段帧数 } from '../../../../world/地点/边城/6-3-下坠/时间线.ts';
import { FallSound } from '../../../场/6-边城/6-3-下坠/声音.tsx';
import { PonderSegment } from '../6-3-2/思索.tsx';
import { 淡出帧数 } from '../../../../world/地点/边城/6-3-2/转场.ts';

const PonderFade: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame >= 淡出帧数) return null;
  return <PonderSegment world={false} voice={false} click={false} frame={段帧数('6-3-2') - 1 + frame} />;
};

// 声音（风、望远镜、砸地、碎方块、台词）排在下坠那条时间线上，每段放自己那一截：见 6-3-下坠/声音.tsx
export const DiveIn: React.FC = () => (
  <>
    <FallSegment segment="6-3-3" />
    <PonderFade />
    <FallSound segment="6-3-3" />
  </>
);
