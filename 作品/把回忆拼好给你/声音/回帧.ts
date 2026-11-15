// 测试按 60 帧核对段.ts 用：秒的 cue、段长、场窗口换回帧号（跨段音效.ts 的 按帧cue 反过来）。这部作品的分镜、音效都按 60 帧的歌曲帧排。
import { segFrameCount, isPerCell, type SoundCue, type SegmentDef } from '@engine/段/段定义.ts';
import { fps } from '../分镜/时间.ts';
import type { FrameCue } from './跨段音效.ts';

const roundFine = (x: number) => Math.round(x * 1e6) / 1e6;

export const toFrameCue = (c: SoundCue): FrameCue => {
  if (c.资产 === undefined) throw new Error(`台词 cue ${c.台词} 不回帧`);
  const { 秒: sec, 长秒: durSec, 增益: gain, fadeOutSec, ...rest } = c;
  if (isPerCell(gain) && gain.每秒 !== fps) throw new Error(`${c.名} 的逐格增益每秒 ${gain.每秒}，不是 ${fps}`);
  return {
    ...rest,
    帧: roundFine(sec * fps),
    帧数: roundFine(durSec * fps),
    ...(gain === undefined ? {} : { 增益: isPerCell(gain) ? gain.值 : gain }),
    ...(fadeOutSec === undefined ? {} : { fadeOutFrames: roundFine(fadeOutSec * fps) }),
  };
};

export const toFrameCues = (seg: Pick<SegmentDef, '声音'>): FrameCue[] => (seg.声音 ?? []).map(toFrameCue);
export const frameCountOf = (seg: Pick<SegmentDef, '秒'>) => segFrameCount(seg, fps);
export const sceneWindowFrames = (seg: Pick<SegmentDef, 'sceneWindow'>) => seg.sceneWindow && { 起帧: roundFine(seg.sceneWindow.startSec * fps), 止帧: roundFine(seg.sceneWindow.endSec * fps) };
