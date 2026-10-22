// 6-4-6 追来：二人强者跳着追过来、越过东墙落进场子，落地踩响第三次尖啸，黄叛起疑（编排见 编排.ts，戏和时钟见 追兵.ts）。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { PursuerScene } from '../../场/6-古城/6-4-6/场景.tsx';
import * as choreo from './编排.ts';
import { withTalkNod } from '../../../world/配音/口型.ts';
import { ChaseInSound } from './声音.tsx';

export const chaseInFrames = choreo.frameCount;

export const ChaseIn: React.FC = () => {
  const frame = useCurrentFrame();
  const poses = choreo.pursuers(frame);
  return (
    <>
      <PursuerScene 段="6-4-6" τ={choreo.τ(frame)} cam={choreo.camera(frame)} liu={withTalkNod(poses.刘, Object.values(choreo.lines), '刘心忠', frame)} huang={withTalkNod(poses.黄, Object.values(choreo.lines), '黄叛', frame)} />
      <ChaseInSound />
    </>
  );
};
