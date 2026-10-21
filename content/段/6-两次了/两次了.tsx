// 6-4-4 两次了：挑箭之后振动飞进感测体、尖啸体尖啸的特写回放（编排见 编排.ts）。画面直接用 6-4-3 的 挡箭画面，只换机位和时钟。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { DeflectView } from '../../场/6-古城/6-4-3/画面.tsx';
import * as choreo from '../../场/6-古城/6-4-4/编排.ts';
import { TwiceSound } from '../../场/6-古城/6-4-4/声音.tsx';
import { mouthAt } from '../../../world/角色/口型.ts';

export const twiceFrames = choreo.frameCount;

export const Twice: React.FC = () => {
  const segFrame = useCurrentFrame();
  return (
    <>
      <DeflectView g={choreo.deflectFrameAt(segFrame)} cam={choreo.camera(segFrame)} 嘴={mouthAt([choreo.lines.烦死了], '李樱', segFrame)} />
      <TwiceSound />
    </>
  );
};
