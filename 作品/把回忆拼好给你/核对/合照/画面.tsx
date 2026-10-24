// 合照核对的画面：按视图表一帧画一个视图，整页就是成片那一帧（不写视图名）。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 合照拍立得, 合照照片, 靠肩画面 } from '../../场/2-隐世之境/合照.tsx';
import { 重逢画面 } from '../../场/2-隐世之境/重逢.tsx';
import { 视图们, type 视图 } from './视图.ts';

const 一帧: React.FC<{ v: 视图 }> = ({ v }) => {
  const 帧 = v.帧 ?? 0;
  switch (v.种) {
    case '照片':
      return <合照照片 后期={v.后期 ?? true} />;
    case '拍立得':
      return <合照拍立得 后期={v.后期 ?? true} />;
    case '重逢':
      return <重逢画面 帧={帧} 气泡字={v.气泡字} 后期={v.后期 ?? true} />;
    case '靠肩':
      return <靠肩画面 帧={帧} 气泡={v.气泡} 褪色={v.褪色} 机位={v.机位} 后期={v.后期 ?? true} />;
  }
};

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      <一帧 v={v} />
    </AbsoluteFill>
  );
};

export default 画面;
