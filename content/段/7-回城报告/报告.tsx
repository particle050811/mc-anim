// 7-4-3 报告（Composition「7-4-3-报告」）：戏、机位在 编排.ts，画面在 画面.tsx，声音在 声音.tsx。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { END } from '../../场/7-收场/7-4-3/编排.ts';
import { ReportPicture } from '../../场/7-收场/7-4-3/画面.tsx';
import { ReportSound } from './声音.tsx';

export const reportFrameCount = END;
export const Report: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <ReportPicture f={frame} />
      <ReportSound />
    </>
  );
};
