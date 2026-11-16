// 6-3-3 俯冲：6-3 下坠（镜头/6-3-下坠/）这条共用时间线上的一个窗口，从思索推近接上来（用户 10-19），到切城墙为止。
// 戏、时钟、机位在 6-3-下坠/编排.ts、时间线.ts，画面在 画面.tsx；开头 `fadeOutSec` 秒上面还叠着淡掉的思索层（6-3-2/转场.ts）。
// 声音（风声、台词）照 6-飞越主世界俯冲边城 段.ts 的 cue 放（definePicture 自动挂），不再挂 6-3-下坠/声音.tsx。
import React from 'react';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { FallSegment } from '../../../场/6-边城/6-3-下坠/画面.tsx';
import { segSpan } from '../../../地点/边城/6-3-下坠/时间线.ts';
import { PonderSegment } from '../6-3-2/思索.tsx';
import { fadeOutSec } from '../../../地点/边城/6-3-2/转场.ts';

const PonderFade: React.FC = () => {
  const sec = useCurrentSec();
  if (sec >= fadeOutSec) return null;
  return <PonderSegment world={false} sec={segSpan('6-3-2') + sec} />;
};

export const DiveIn: React.FC = () => (
  <>
    <FallSegment segment="6-3-3" />
    <PonderFade />
  </>
);
