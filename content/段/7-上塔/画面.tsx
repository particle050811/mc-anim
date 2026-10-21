// 7-3-2 上塔：整场共用的 ../7-3/画面.tsx 按本段的场时刻和机位画出来，声音见 声音.tsx。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { ScenePicture } from '../../场/7-墙头追逐/7-3/画面.tsx';
import * as choreo from '../../场/7-墙头追逐/7-3-2/编排.ts';
import { Sound } from './声音.tsx';

export const c732FrameCount = choreo.END;
export const C732: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <>
      <ScenePicture T={choreo.T于(frame)} cam={choreo.camera(frame)} width={width} height={height} />
      <Sound />
    </>
  );
};
