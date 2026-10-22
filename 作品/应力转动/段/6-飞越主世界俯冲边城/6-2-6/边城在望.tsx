// 6-2-6 边城在望：6-2-5 那条飞行时间线上的最后一个窗口，画面和 6-2-5 同一个组件（6-2-5/飞越主世界.tsx 的 飞行画面），首帧接 6-2-5 末帧。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FlightView } from '../../../地点/边城/6-2-5/飞越主世界.tsx';
import { segmentTable } from '../../../地点/边城/6-2-5/编排.ts';

export const BorderTownAhead: React.FC = () => {
  const frame = useCurrentFrame();
  return <FlightView G={segmentTable['6-2-6'].起 + frame} startFrame={segmentTable['6-2-6'].起} />;
};
