// 6-4-3b、6-4-3c 的正式段：时间线、机位、人和特效的演法见 打斗编排.ts，这里排画面。
// 声音照 段/6-挡箭、段/6-挑飞 的 段.ts 的 cue 放（definePicture 自动挂），不再在这里排声音.tsx 的剧情事件、箭飞风声、台词。
import React from 'react';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { DeflectView } from './画面.tsx';
import { frameFractional as mainFrameFractional } from './时间线.ts';
import { cameraAt, deflectArrowFrames, flickArrowFrames, fxAt, liying, tl, segStartFrame } from './打斗编排.ts';
export { deflectArrowFrames, flickArrowFrames };

// 段里第 0 帧 = 这条时间线的全局帧 startFrame（帧是 1/tl.FPS 秒一格）
const makeSegment = (startFrame: number): React.FC => {
  const SegmentComp: React.FC = () => {
    const f = startFrame + useCurrentSec() * tl.FPS;
    return <DeflectView g={mainFrameFractional(tl.storyTime(f))} cam={cameraAt(f)} liying={liying} fx={fxAt(f)} />;
  };
  return SegmentComp;
};
export const DeflectArrow = makeSegment(segStartFrame['6-4-3b']);
export const FlickArrow = makeSegment(segStartFrame['6-4-3c']);
