// 6-4-6 追来：二人强者跳着追过来、越过东墙落进场子，落地踩响第三次尖啸，黄叛起疑（编排见 编排.ts，戏和时钟见 追兵.ts）。声音照本段 段.ts 的 cue 放（definePicture 自动挂）。
import React from 'react';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { PursuerScene } from '../../场/6-古城/6-4-6/场景.tsx';
import * as choreo from './编排.ts';
import { withTalkNod } from '../../配音/口型.ts';
import { lipCues } from '../../地点/古城4x/6-4-1/古城戏.ts';
const cues = lipCues(Object.values(choreo.lines));
export const ChaseIn: React.FC = () => {
  const t = useCurrentSec();
  const poses = choreo.pursuers(t);
  return <PursuerScene segment="6-4-6" τ={choreo.τ(t)} cam={choreo.camera(t)} liu={withTalkNod(poses.刘, cues, '刘心忠', t, 1)} huang={withTalkNod(poses.黄, cues, '黄叛', t, 1)} />;
};
