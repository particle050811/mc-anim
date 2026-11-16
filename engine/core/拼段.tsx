// 几段 Composition 各截一段 [从, 到) 首尾相接，拼成一个 Composition：每截是一个带 trimBefore 的 <Sequence>，
// 截里的组件看到的时间和单独渲那一段时一样。
// 每秒：从、到 以 1/每秒 秒为一格（截表直接写秒的给 1），按 Composition 帧率换算，可以落在两帧之间。
import React from 'react';
import { Sequence } from 'remotion';
import { useFrameRate } from '../段/时间.tsx';

export type Clip = { segment: string; 从: number; dest: number };
export const SegmentStitch: React.FC<{ cuts: readonly (Clip & { picture: React.ComponentType })[]; perSec: number }> = ({ cuts, perSec: perSec }) => {
  const r = useFrameRate();
  const k = r / perSec;
  let at = 0;
  return (
    <>
      {cuts.map(({ segment: segKey, 从: fromFrame, dest: toFrame, picture: Part }) => {
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
