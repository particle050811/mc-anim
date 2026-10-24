// 日落划船核对的画面：按视图表一帧画一个视图，整页就是成片那一帧（不写视图名）；颗粒的种子是那一帧的歌曲帧（场/2-海上/海上.tsx 里给的）。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 日落划船画面 } from '../../场/2-海上/海上.tsx';
import { 视图们 } from './视图.ts';

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      <日落划船画面 歌曲帧={v.帧} 浪={v.浪 ?? true} 后期={v.后期 ?? true} 描边={v.描边 ?? true} />
    </AbsoluteFill>
  );
};

export default 画面;
