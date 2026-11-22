// 几段 Composition 各截一段 [从, 到) 首尾相接，拼成一个 Composition：每截是一个带 trimBefore 的 <Sequence>，
// 截里的组件看到的时间和单独渲那一段时一样。帧位和截里的时钟在 拼段时序.ts（加载计划照它换时钟）。
// 每秒：从、到 以 1/每秒 秒为一格（截表直接写秒的给 1），按 Composition 帧率换算，可以落在两帧之间。
import React from 'react';
import { Sequence } from 'remotion';
import { useFrameRate } from '../段/时间.tsx';
import { stitchSpans, type Clip } from './拼段时序.ts';

export type { Clip } from './拼段时序.ts';
export const SegmentStitch: React.FC<{ cuts: readonly (Clip & { picture: React.ComponentType })[]; perSec: number }> = ({ cuts, perSec: perSec }) => (
  <>
    {stitchSpans(cuts, perSec, useFrameRate()).map(({ cut: { segment: segKey, 从: fromSec, dest: toSec, picture: Part }, from, durationInFrames, trimBefore }) => (
      <Sequence key={`${segKey}:${fromSec}`} name={`${segKey} [${fromSec}, ${toSec})`} from={from} durationInFrames={durationInFrames} trimBefore={trimBefore}>
        <Part />
      </Sequence>
    ))}
  </>
);
