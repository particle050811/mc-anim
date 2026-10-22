// 把配乐挂到 Composition 上，并让画面按歌曲时间对齐。
// 用法：Composition 的 `durationInFrames` 用 `segmentFrames('6-1-4')`，组件里放 `<SegmentMusic 段号="6-1-4" />`（帧 0 = 这段在音乐里的开头，带所在那半的淡入淡出）；
//   关键帧卡拍用 `frameInSegment('6-1-4', [9, 1])`（第 9 小节第 1 拍是这段第几帧）。参考视频不要音乐就渲染时 --muted 或去掉 `<SegmentMusic>`。
// 起点先取整到帧（`songStartFrame`），第 f 帧对应歌曲时间 (起帧 + f) / fps，音频和画面拍点同一起帧，取整误差不到半帧。
import { Audio } from '@remotion/media';
import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { posToSec, type MusicPos, type Song } from '@engine/audio/曲目.ts';
import { musicVolume } from '@engine/audio/混音.ts';
import { halfGain, findSegment } from './第六章飞行.ts';
import { useFirstVisibleFrame, useSfxLog } from '@engine/audio/音效清单.ts';
import { tagSrc } from '@engine/audio/同源区分.ts';

export const songStartFrame = (startSec: number, fps: number) => Math.round(startSec * fps);
export const songSec = (startSec: number, frame: number, fps: number) => (songStartFrame(startSec, fps) + frame) / fps;

// 从歌曲时间 `起` 开始放这首歌（帧 0 = 起）。`增益` 是歌曲时间到音量（0~1）的函数；`节拍声` 为 true 或给音量就叠上节拍器
export const MusicAudio: React.FC<{
  song: Song;
  startSec: number;
  gain?: (t: number) => number;
  volume?: number;
  clickTrack?: boolean | number;
}> = ({ song, startSec: startSec, gain: gainFn, volume: volume = 1, clickTrack: clickTrack }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const logMusic = useSfxLog('配乐清单');
  const firstVisible = useFirstVisibleFrame(); // volume 回调的帧从露出来那一帧数起（见 音效清单.ts）
  const startFrame = songStartFrame(startSec, fps);
  // Remotion 按帧给音频乘音量，取这一帧中点的增益，淡入淡出的台阶才不会偏早半帧。
  // 配乐总线固定乘 混音.ts 的 `musicVolume`（用户 10-10 定），节拍声不乘
  const volumeAt = (f: number) => musicVolume * volume * (gainFn ? gainFn((startFrame + f + 0.5) / fps) : 1);
  // 文件比歌曲时间晚开始（偏移为负且起点更早）时，先空着等到文件开头
  const fileStartFrame = startFrame + song.fileOffsetSec * fps;
  const leadFrames = fileStartFrame >= 0 ? 0 : Math.round(-fileStartFrame);
  logMusic({ 名: '配乐', 文件: song.文件, from: leadFrames, 帧数: durationInFrames - leadFrames, 入点秒: Math.max(0, fileStartFrame) / fps, 速率: 1, 循环: false, gainAt: (f) => volumeAt(f + leadFrames) });
  // 一段里放几条同一首歌时按起点区分，不然叠着的那几帧只剩一条，见 同源区分.ts
  const src = tagSrc(song.音频, `起${startFrame}`);
  const mainAudio =
    fileStartFrame >= 0 ? (
      <Audio src={src} trimBefore={fileStartFrame} volume={(f) => volumeAt(f + firstVisible)} />
    ) : (
      <Sequence from={leadFrames} layout="none">
        <Audio src={src} volume={(f) => volumeAt(f + Math.max(leadFrames, firstVisible))} />
      </Sequence>
    );
  return (
    <>
      {mainAudio}
      {clickTrack ? <Audio src={song.节拍声} trimBefore={startFrame} volume={typeof clickTrack === 'number' ? clickTrack : 0.5} /> : null}
    </>
  );
};

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

export const useSegmentSongSec = (segmentId: string) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return songSec(segmentRange(segmentId).start, frame, fps);
};

// 播这一段对应的那一截配乐，带上所在那一半的淡入淡出
export const SegmentMusic: React.FC<{ segmentId: string; volume?: number; clickTrack?: boolean | number }> = ({ segmentId: segmentId, volume: volume, clickTrack: clickTrack }) => {
  const { start: startSec, table: musicTable, segment: segment } = segmentRange(segmentId);
  return <MusicAudio song={musicTable.song} startSec={startSec} gain={(t) => halfGain(musicTable, segment.half, t)} volume={volume} clickTrack={clickTrack} />;
};
