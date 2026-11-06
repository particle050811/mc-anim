// 第 6 章配乐的段区间：画面按歌曲时间对齐（配乐本身由各段 段.ts 的配乐 cue 放）。
// 关键帧卡拍用 `frameInSegment('6-1-4', [9, 1])`（第 9 小节第 1 拍是这段第几格）。
// 起点先取整到 1/24 秒的格（`songStartFrame`，第 6、7 章的编排格），第 f 格对应歌曲时间 (起帧 + f) / 24，取整误差不到半格。
import { posToSec, type MusicPos } from '@engine/audio/曲目.ts';
import { findSegment } from './第六章飞行.ts';

export const songStartFrame = (startSec: number, fps: number) => Math.round(startSec * fps);

// 段的歌曲时间区间（秒）
export const segmentRange = (segmentId: string) => {
  const { table: musicTable, segment: segment } = findSegment(segmentId);
  return { start: posToSec(musicTable.song, segment.start), end: posToSec(musicTable.song, segment.end), table: musicTable, segment: segment };
};

export const segmentFrames = (segmentId: string, fps = 24) => {
  const { start: startSec, end: endSec } = segmentRange(segmentId);
  return songStartFrame(endSec, fps) - songStartFrame(startSec, fps);
};

// 段里第几帧对着这个音乐位置
export const frameInSegment = (segmentId: string, pos: MusicPos, fps = 24) => {
  const { start: startSec, table: musicTable } = segmentRange(segmentId);
  return Math.round(posToSec(musicTable.song, pos) * fps) - songStartFrame(startSec, fps);
};
