// 扑龙蛋照片核对的画面：场/2-末地 的 末地镜头 定在 照片-扑龙蛋 那一帧（段内帧，颗粒种子同片子里那一帧），按视图表换一项。
import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { 末地镜头 } from '../../场/2-末地/镜头.tsx';
import { 事 } from '../../场/2-末地/编排.ts';
import { 视图们 } from './视图.ts';

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  return <末地镜头 f={事['照片-扑龙蛋']} 干净={v.干净} />;
};

export default 画面;
