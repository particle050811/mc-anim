// 6-4-3b、6-4-3c 的正式段：时间线、机位、人和特效的演法见 打斗编排.ts，这里排画面。
// 声音照 段/6-挡箭、段/6-挑飞 的 段.ts 的 cue 放（定义画面 自动挂），不再在这里排声音.tsx 的剧情事件、箭飞风声、台词。
import React from 'react';
import { use当前秒 } from '@engine/段/时间.tsx';
import { DeflectView } from './画面.tsx';
import { 帧小数 as 主帧小数 } from './时间线.ts';
import { cameraAt, deflectArrowFrames, flickArrowFrames, fxAt, liying, tl, 段起帧 } from './打斗编排.ts';
export { deflectArrowFrames, flickArrowFrames };

// 段里第 0 帧 = 这条时间线的全局帧 startFrame（帧是 1/tl.FPS 秒一格）
const makeSegment = (startFrame: number): React.FC => {
  const SegmentComp: React.FC = () => {
    const f = startFrame + use当前秒() * tl.FPS;
    return <DeflectView g={主帧小数(tl.剧情时间(f))} cam={cameraAt(f)} liying={liying} fx={fxAt(f)} />;
  };
  return SegmentComp;
};
export const DeflectArrow = makeSegment(段起帧['6-4-3b']);
export const FlickArrow = makeSegment(段起帧['6-4-3c']);
