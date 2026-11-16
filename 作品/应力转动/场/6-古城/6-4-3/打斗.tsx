// 6-4-3b、6-4-3c 的正式段：时间线、机位、人和特效的演法见 打斗编排.ts，这里排画面。
// 声音照 段/6-挡箭、段/6-挑飞 的 段.ts 的 cue 放（definePicture 自动挂），不再在这里排声音.tsx 的剧情事件、箭飞风声、台词。
import React from 'react';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { DeflectView } from './画面.tsx';
import { secFractional as mainSecFractional } from './时间线.ts';
import { cameraAt, deflectArrowSec, flickArrowSec, fxAt, liying, tl, segStartSec } from './打斗编排.ts';
export { deflectArrowSec, flickArrowSec };

// 段里 0 秒 = 这条时间线的画面秒 startSec
const makeSegment = (startSec: number): React.FC => {
  const SegmentComp: React.FC = () => {
    const g = startSec + useCurrentSec();
    return <DeflectView g={mainSecFractional(tl.storyTime(g))} cam={cameraAt(g)} liying={liying} fx={fxAt(g)} />;
  };
  return SegmentComp;
};
export const DeflectArrow = makeSegment(segStartSec['6-4-3b']);
export const FlickArrow = makeSegment(segStartSec['6-4-3c']);
