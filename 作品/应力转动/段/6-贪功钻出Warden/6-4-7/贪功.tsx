// 6-4-7 贪功的画面：刘心忠一挥手、一跳踩下去，第四次尖啸，二人往西走（= 6-4-8 首帧）。编排见 编排.ts，戏和振动链见 ../6-4-6/追兵.ts；成片段是 ../6-4-7至9/。
import React from 'react';
import { PursuerScene } from '../../../场/6-古城/6-4-6/场景.tsx';
import * as choreo from './编排.ts';
import { withTalkNod } from '../../../配音/口型.ts';
import { lipCues, TALK_NOD_PER_SEC } from '../../../地点/古城4x/6-4-1/古城戏.ts';
const cues = lipCues(Object.values(choreo.lines), TALK_NOD_PER_SEC);

// t：本段秒（6-4-7至9 的前一截，见 ../6-4-7至9/）
export const GloryGrabView: React.FC<{ t: number }> = ({ t }) => {
  const pursuerPoses = choreo.pursuers(t);
  return <PursuerScene 段="6-4-7" τ={choreo.τ(t)} cam={choreo.camera(t)} liu={withTalkNod(pursuerPoses.刘, cues, '刘心忠', t * TALK_NOD_PER_SEC)} huang={pursuerPoses.黄} />;
};
