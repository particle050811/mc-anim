// 测试按 60 帧核对段.ts 用：秒的 cue、段长、场窗口换回帧号（跨段音效.ts 的 按帧cue 反过来）。这部作品的分镜、音效都按 60 帧的歌曲帧排。
import { segFrameCount, isPerCell, type SoundCue, type SegmentDef } from '@engine/段/段定义.ts';
import { fps } from '../分镜/时间.ts';
import type { FrameCue } from './跨段音效.ts';

const roundFine = (x: number) => Math.round(x * 1e6) / 1e6;

export const toFrameCue = (c: SoundCue): FrameCue => {
  if (c.asset === undefined) throw new Error(`台词 cue ${c.lines} 不回帧`);
  const { sec: sec, 长秒: durSec, 增益: gain, fadeOutSec, ...rest } = c;
  if (isPerCell(gain) && gain.perSec !== fps) throw new Error(`${c.name} 的逐格增益每秒 ${gain.perSec}，不是 ${fps}`);
  return {
    ...rest,
    frame: roundFine(sec * fps),
    frameCount: roundFine(durSec * fps),
    ...(gain === undefined ? {} : { 增益: isPerCell(gain) ? gain.value : gain }),
    ...(fadeOutSec === undefined ? {} : { fadeOutFrames: roundFine(fadeOutSec * fps) }),
  };
};

export const toFrameCues = (seg: Pick<SegmentDef, 'sound'>): FrameCue[] => (seg.sound ?? []).map(toFrameCue);
export const frameCountOf = (seg: Pick<SegmentDef, 'sec'>) => segFrameCount(seg, fps);
export const sceneWindowFrames = (seg: Pick<SegmentDef, 'sceneWindow'>) => seg.sceneWindow && { 起帧: roundFine(seg.sceneWindow.startSec * fps), 止帧: roundFine(seg.sceneWindow.endSec * fps) };
