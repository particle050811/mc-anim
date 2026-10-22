// 6-4-3b、6-4-3c 的正式段：时间线、机位、人和特效的演法见 打斗编排.ts，这里排画面和声音。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { GameSoundTrack, LoopSound } from '../../../../engine/audio/游戏音效.tsx';
import { scheduleToScreen } from '../../../../engine/audio/慢放.ts';
import { LineTrack, lineTable } from '../../../../world/配音/台词轨.tsx';
import { DeflectView } from './画面.tsx';
import { storyEvents, shoutLine } from './声音.tsx';
import { 帧小数 as 主帧小数 } from './时间线.ts';
import { cameraAt, deflectArrowFrames, flickArrowFrames, flightWindFrames, fxAt, liying, tl, 段起帧 } from './打斗编排.ts';
export { deflectArrowFrames, flickArrowFrames };

// 声音：同一批剧情事件按这条时间线的时钟重排（招架的「叮」落在定住的第一帧）
// 6-4-3c 从切黄叛（C2）跳切进来：6-4-3b 末尾和跳掉那 0.3 秒里响起的（招架、击穿的余音，感测体激活、尖啸）都在 6-4-3b 段尾淡完，不带进黄叛的镜头；
// 斩击只落在 6-4-3b 末帧，删；落石落地在 6-4-3c（只剩 C2）结束以后，不放
const bEnd = 段起帧['6-4-3b'] + deflectArrowFrames;
const sounds = scheduleToScreen(storyEvents, tl)
  .filter((s) => !s.名?.startsWith('斩击'))
  .map((s) => (s.帧 < 段起帧['6-4-3c'] && s.名 !== '落石落地' ? { ...s, 止帧: bEnd } : s));
const listener = (f: number) => cameraAt(Math.min(Math.max(f, 0), tl.总帧数 - 1)).pos;
// 箭飞的风声（用户 10-18 定：「箭矢飞行的时候 应该有猛烈的呼啸的风声」）：镜头贴着箭飞，听到的就是游戏里高速飞行时的鞘翅风声
// （ElytraOnPlayerSoundInstance：速度够快时音量 1、音高 1.2，这里取满速那一档），归「重」。跟拍起 2 帧淡入，切到李樱后到弹开定住淡完，让出招架的「叮」。
// 慢放里照 音效/慢放.ts 的规矩按画面时间原速放、不降调。弓前风扇的风场（item.elytra.flying，音高 2）在 6-4-3a 段尾就停：跟拍第一帧镜头已在风扇几十米外，出了它 16 格的可听范围
const flightWindGain = (g: number) => {
  const { 起, 切, 止 } = flightWindFrames;
  if (g < 切) return Math.min(1, (g - 起 + 1) / 2);
  return Math.max(0, 1 - (g - 切) / Math.max(1, 止 - 切));
};

// 段里第 0 帧 = 这条时间线的全局帧 startFrame
const makeSegment = (startFrame: number, frameCount: number): React.FC => {
  const SegmentComp: React.FC = () => {
    const f = startFrame + useCurrentFrame();
    // 放箭前两条时间线一样，开口帧照用；上一段开口、这一段还没说完的也放（剩下的那截）
    const shoutSegFrame = shoutLine.帧 - startFrame;
    const hasShout = shoutSegFrame < frameCount && shoutSegFrame + lineTable[shoutLine.id].时长 * tl.FPS > 0;
    return (
      <>
        <DeflectView g={主帧小数(tl.剧情时间(f))} cam={cameraAt(f)} liying={liying} fx={fxAt(f)} />
        <GameSoundTrack sounds={sounds} listener={listener} startFrame={startFrame} frameCount={frameCount} />
        {hasShout && <LineTrack 句们={[{ id: shoutLine.id, 帧: shoutSegFrame }]} />}
        <LoopSound name="箭飞风声" event="item.elytra.flying" beginFrame={flightWindFrames.起} endFrame={flightWindFrames.止} startFrame={startFrame} pitch={1.2} tier="重" envelope={flightWindGain} />
      </>
    );
  };
  return SegmentComp;
};
export const DeflectArrow = makeSegment(段起帧['6-4-3b'], deflectArrowFrames);
export const FlickArrow = makeSegment(段起帧['6-4-3c'], flickArrowFrames);
