// 魔法酒狐核对的画面：现在是占位，只画视图名；模型组件做好后按视图表画。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 视图们 } from './视图.ts';

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  return (
    <AbsoluteFill style={{ background: '#1b1d22', color: '#eeeeee', fontFamily: 'sans-serif', justifyContent: 'center', alignItems: 'center', fontSize: 48 }}>
      核对-魔法酒狐 · {v.名}（占位）
    </AbsoluteFill>
  );
};

export default 画面;
