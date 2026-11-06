// 日落划船核对的画面：按视图表一帧画一个视图，整页就是成片那一帧（不写视图名）；颗粒的种子是那一帧歌曲帧（场/2-海上/海上.tsx 里给的）。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { 叠化样式, 浪样式 } from '../../场/2-海上/参数.ts';
import { 眼机位 } from '../../场/2-海上/编排.ts';
import { 日落划船画面 } from '../../场/2-海上/海上.tsx';
import { 祭坛画面 } from '../../场/2-祭坛/祭坛.tsx';
import { 视图们 } from './视图.ts';
import { use视图下标 } from '@engine/段/时间.tsx';

/** 眼睛特写同段里（第 3 句祭坛那一镜接着推） */
const 眼睛 = (g: number) => <祭坛画面 g={g} 机={眼机位(g)} />;

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      <日落划船画面 歌曲帧={v.帧} 眼睛={眼睛} 浪={v.浪 ?? true} 后期={v.后期 ?? true} 叠化样式={叠化样式} 浪样式={浪样式} />
    </AbsoluteFill>
  );
};

export default 画面;
