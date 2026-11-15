// 跨段的音效：一个声音在歌上从某一帧起放、放过段界（比如第 15 句的铃声、风声从门口那段拖进隐世之境那段），每段只放落在自己窗口里的那一截。
// 纯模块（段.ts 读）。正片同一串的段按样本首尾相接，后一段从 入点秒 = 已经放过的帧数 ÷ fps 接着放，接起来和一口气放完一样。
// 本作品按 60 帧编排，cue 也按段内帧算；按帧cue 换成段.ts 要的秒（engine/段/段定义.ts 的 资产cue）。
import type { AssetCue } from '@engine/段/段定义.ts';
import { fps } from '../分镜/时间.ts';

/** 按本作品的帧写的资产 cue：帧、帧数是段内帧，增益可以一帧一个，淡出是帧数 */
export type FrameCue = Omit<AssetCue, '秒' | '长秒' | '增益' | 'fadeOutSec'> & { 帧: number; 帧数: number; 增益?: number | readonly number[]; fadeOutFrames?: number };

/** 按帧写的 cue → 段.ts 的 cue（秒；一帧一个的增益写成每秒 fps 个的逐格增益） */
export const toAssetCue = ({ 帧: startFrame, 帧数: frameCount, 增益: gain, fadeOutFrames, ...rest }: FrameCue): AssetCue => ({
  ...rest,
  秒: startFrame / fps,
  长秒: frameCount / fps,
  ...(gain === undefined ? {} : typeof gain === 'number' ? { 增益: gain } : { 增益: { 每秒: fps, 值: gain } }),
  ...(fadeOutFrames === undefined ? {} : { fadeOutSec: fadeOutFrames / fps }),
});

export type SongSound = {
  资产: string;
  名: string;
  /** 文件头落在哪个歌曲帧（整数） */
  起帧: number;
  /** 放几帧（不给就放满文件：ceil(时长秒 × fps)） */
  帧数?: number;
  时长秒: number;
  /** 歌曲帧 → 增益 */
  增益: (songFrame: number) => number;
};

/** 这个声音在段窗口 [起秒, 止秒)（歌上的秒，落在帧上）里的那一截 cue；完全不在窗口里给 null */
export const clipToSegment = (windowSec: { startSec: number; endSec: number }, cue: SongSound): AssetCue | null => {
  if (!Number.isInteger(cue.起帧)) throw new Error(`${cue.名} 的起帧要是整数：${cue.起帧}`);
  const span = { 起帧: Math.round(windowSec.startSec * fps), 止帧: Math.round(windowSec.endSec * fps) };
  const endFrame = cue.起帧 + (cue.帧数 ?? Math.ceil(cue.时长秒 * fps));
  const a = Math.max(cue.起帧, span.起帧);
  const b = Math.min(endFrame, span.止帧);
  if (b <= a) return null;
  return toAssetCue({
    帧: a - span.起帧,
    资产: cue.资产,
    名: cue.名,
    帧数: b - a,
    ...(a > cue.起帧 ? { 入点秒: (a - cue.起帧) / fps } : {}),
    增益: Array.from({ length: b - a }, (_, i) => Math.round(cue.增益(a + i) * 1e6) / 1e6),
  });
};
