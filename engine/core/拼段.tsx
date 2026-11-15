// 几段 Composition 各截一段 [从, 到) 首尾相接，拼成一个 Composition：每截是一个带 trimBefore 的 <Sequence>，
// 截里的组件看到的时间和单独渲那一段时一样。
// 每秒：从、到 以 1/每秒 秒为一格（第 6、7 章的截表是 1/24 秒），按 Composition 帧率换算，可以落在两帧之间。
import React from 'react';
import { Sequence } from 'remotion';
import { useFrameRate } from '../段/时间.tsx';

export type Clip = { 段: string; 从: number; 到: number };
export const SegmentStitch: React.FC<{ cuts: readonly (Clip & { picture: React.ComponentType })[]; 每秒: number }> = ({ cuts, 每秒: perSec }) => {
  const r = useFrameRate();
  const k = r / perSec;
  let at = 0;
  return (
    <>
      {cuts.map(({ 段: segKey, 从: fromFrame, 到: toFrame, picture: Part }) => {
        const from = at;
        at += toFrame - fromFrame;
        return (
          <Sequence key={`${segKey}:${fromFrame}`} name={`${segKey} [${fromFrame}, ${toFrame})`} from={from * k} durationInFrames={(toFrame - fromFrame) * k} trimBefore={fromFrame * k}>
            <Part />
          </Sequence>
        );
      })}
    </>
  );
};
