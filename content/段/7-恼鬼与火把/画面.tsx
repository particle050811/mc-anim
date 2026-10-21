// 7-1-2 恼鬼与火把：整场共用的 ../7-1/画面.tsx 按本段的场时刻和机位画出来，声音见 声音.tsx。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { ScenePicture } from '../../../world/地点/古城4x/7-1/画面.tsx';
import * as choreo from './编排.ts';
import { Sound } from './声音.tsx';

export const c712FrameCount = choreo.END;
export const C712: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <>
      <ScenePicture t={choreo.t于(frame)} cam={choreo.camera(frame)} width={width} height={height} />
      <Sound />
    </>
  );
};
