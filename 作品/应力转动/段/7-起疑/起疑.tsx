// 7-4-4 起疑（Composition「7-4-4-起疑」）：戏、机位在 编排.ts，画面在 画面.tsx，声音在 声音.tsx。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { END } from './编排.ts';
import { SuspicionPicture } from './画面实现.tsx';
import { SuspicionSound } from './声音.tsx';

export const suspicionFrameCount = END;
export const Suspicion: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <SuspicionPicture f={frame} />
      <SuspicionSound />
    </>
  );
};
