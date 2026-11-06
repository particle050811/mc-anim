// 6-4-4 两次了：挑箭之后振动飞进感测体、尖啸体尖啸的特写回放（编排见 编排.ts）。画面直接用 6-4-3 的 挡箭画面，只换机位和时钟。声音照本段 段.ts 的 cue 放（定义画面 自动挂），不再挂 6-4-4/声音.tsx。
import React from 'react';
import { use当前秒 } from '@engine/段/时间.tsx';
import { DeflectView } from '../../场/6-古城/6-4-3/画面.tsx';
import * as choreo from '../../场/6-古城/6-4-4/编排.ts';
import { mouthAt } from '../../配音/口型.ts';

export const twiceFrames = choreo.frameCount;

export const Twice: React.FC = () => {
  const segFrame = use当前秒() * choreo.FPS;
  return <DeflectView g={choreo.deflectFrameAt(segFrame)} cam={choreo.camera(segFrame)} 嘴={mouthAt([choreo.lines.烦死了], '李樱', segFrame)} />;
};
