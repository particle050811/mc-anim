// 跨段的音效：一个声音在歌上从某一帧起放、放过段界（比如第 15 句的铃声、风声从门口那段拖进隐世之境那段），每段只放落在自己窗口里的那一截。
// 纯模块（段.ts 读）。正片同一串的段按样本首尾相接，后一段从 入点秒 = 已经放过的帧数 ÷ fps 接着放，接起来和一口气放完一样。
// 本作品按 60 帧编排，cue 也按段内帧算；按帧cue 换成段.ts 要的秒（engine/段/段定义.ts 的 资产cue）。
import type { 资产cue } from '@engine/段/段定义.ts';
import { fps } from '../分镜/时间.ts';

/** 按本作品的帧写的资产 cue：帧、帧数是段内帧，增益可以一帧一个，淡出是帧数 */
export type 帧上cue = Omit<资产cue, '秒' | '长秒' | '增益' | '淡出秒'> & { 帧: number; 帧数: number; 增益?: number | readonly number[]; 淡出?: number };

/** 按帧写的 cue → 段.ts 的 cue（秒；一帧一个的增益写成每秒 fps 个的逐格增益） */
export const 按帧cue = ({ 帧, 帧数, 增益, 淡出, ...其余 }: 帧上cue): 资产cue => ({
  ...其余,
  秒: 帧 / fps,
  长秒: 帧数 / fps,
  ...(增益 === undefined ? {} : typeof 增益 === 'number' ? { 增益 } : { 增益: { 每秒: fps, 值: 增益 } }),
  ...(淡出 === undefined ? {} : { 淡出秒: 淡出 / fps }),
});

export type 歌上音效 = {
  资产: string;
  名: string;
  /** 文件头落在哪个歌曲帧（整数） */
  起帧: number;
  /** 放几帧（不给就放满文件：ceil(时长秒 × fps)） */
  帧数?: number;
  时长秒: number;
  /** 歌曲帧 → 增益 */
  增益: (歌曲帧: number) => number;
};

/** 这个声音在段窗口 [起秒, 止秒)（歌上的秒，落在帧上）里的那一截 cue；完全不在窗口里给 null */
export const 段里那截 = (窗秒: { 起秒: number; 止秒: number }, 音: 歌上音效): 资产cue | null => {
  if (!Number.isInteger(音.起帧)) throw new Error(`${音.名} 的起帧要是整数：${音.起帧}`);
  const 窗 = { 起帧: Math.round(窗秒.起秒 * fps), 止帧: Math.round(窗秒.止秒 * fps) };
  const 尾 = 音.起帧 + (音.帧数 ?? Math.ceil(音.时长秒 * fps));
  const a = Math.max(音.起帧, 窗.起帧);
  const b = Math.min(尾, 窗.止帧);
  if (b <= a) return null;
  return 按帧cue({
    帧: a - 窗.起帧,
    资产: 音.资产,
    名: 音.名,
    帧数: b - a,
    ...(a > 音.起帧 ? { 入点秒: (a - 音.起帧) / fps } : {}),
    增益: Array.from({ length: b - a }, (_, i) => Math.round(音.增益(a + i) * 1e6) / 1e6),
  });
};
