// 2-抢龙蛋 的画面：场/2-末地/镜头.tsx 的 末地镜头 按段内帧画，配原声。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { 末地镜头 } from '../../场/2-末地/镜头.tsx';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 原声 } from '../../配乐/原声.ts';
import 段 from './段.ts';

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      <末地镜头 f={f} />
    </>
  );
};

export default 画面;
