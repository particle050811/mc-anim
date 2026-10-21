// 音效、配乐、台词清单：剪辑包里每个音效单独一个片段（用户 10-15 要求），配乐也照清单合成、不再各段只出声音地渲一遍（用户 10-15：那要渲 40 分钟）；
// 三份清单合起来就是一段的全部声音，工具/剪辑微调/只换声音.py 照它只出声音、不重渲画面（用户 10-18）。
// 渲染时给 --props='{"exportSfx":true}'，声音组件（游戏音效.tsx 的 GameSoundTrack、LoopSound，配乐音轨.tsx 的 MusicAudio，声音Sequence.tsx 的 清单Audio）
// 渲染时把放法打到浏览器日志，一声一行 `音效清单 {json}` / `配乐清单 {json}` / `台词清单 {json}`（台词轨.tsx）；工具/剪辑微调/导出音效清单.mjs 收集，导出剪辑包.py 照着合成。
// 帧是 Composition 的绝对帧（外面包的 Sequence 的起点、长度已经算进去）。
import { useContext } from 'react';
import { Internals, useVideoConfig } from 'remotion';
import { 渲染输入 } from '../core/渲染设置.ts';

export type SfxClipLog = {
  名: string;
  档?: string; // 混音.ts 的分档（剪映片段名前标出来），没分档的没有
  文件: string; // 相对 src/（配乐在 src 外面，写成 ../../杂项/…）
  起帧: number; // Composition 的整帧
  帧数: number;
  入点秒: number; // 从文件第几秒放起
  速率: number; // 变速变调
  循环: boolean;
  增益: number[]; // 每帧乘到文件上的音量（含音效总线）
};

const exportOn = (() => {
  try {
    return Boolean((渲染输入() as Record<string, unknown>).exportSfx);
  } catch {
    return false;
  }
})();
const logged = new Set<string>();

// 第 0 帧还没挂上的声音（lib/拼段.tsx 的后几截、声音Sequence.tsx 包的晚起声音）：打一行它们露出来的那一帧，导出音效清单.mjs 照着补渲，收齐里面的声音
export const logRenderFrames = (frames: number[]) => {
  const later = frames.filter((f) => f > 0);
  if (exportOn && later.length) console.log(`补渲帧 ${JSON.stringify(later)}`);
};

// 声音Sequence.tsx 用：在这一层时间线上 from 起、长 durationInFrames 的 Sequence，在 Composition 里第一次露出来是哪一帧（露不出来就不报）
export const useLateSequenceLog = (from: number, durationInFrames: number) => {
  const seq = useContext(Internals.SequenceContext);
  const compFrames = Internals.useVideo()?.durationInFrames ?? Infinity;
  if (!exportOn) return;
  const offset = seq ? seq.cumulatedFrom + seq.relativeFrom : 0;
  const first = seq ? offset - seq.cumulatedNegativeFrom : 0;
  const start = Math.max(first, offset + from);
  const end = Math.min(compFrames, seq ? offset + seq.durationInFrames : Infinity, offset + from + durationInFrames);
  if (start < end) logRenderFrames([start]);
};

// 这一层时间线上露出来的第一帧（外面的 Sequence 带 trimBefore、或从负帧起时 > 0）。声音的 Sequence 要从这一帧以后起：
// Remotion 给 volume 回调的帧从声音露出来那一帧数起，Sequence 起在露出来以前，回调的帧就错开了
export const useFirstVisibleFrame = () => Math.max(0, -(useContext(Internals.SequenceContext)?.cumulatedNegativeFrom ?? 0));

// 在声音组件顶上调：返回记一声的函数（没开就是空函数）。from：在这个组件所在时间线上的起帧；gainAt(f)：第 f 帧（从起帧数）的音量
// 外面包的 Sequence 带 trimBefore（lib/拼段.tsx）时，这一截从 offset − cumulatedNegativeFrom 才露出来，之前的那一截从文件里跳过去
export const useSfxLog = (kind: '音效清单' | '配乐清单' | '台词清单' = '音效清单') => {
  const seq = useContext(Internals.SequenceContext);
  const { fps } = useVideoConfig();
  const compFrames = Internals.useVideo()?.durationInFrames ?? Infinity;
  if (!exportOn) return (_clip: Omit<SfxClipLog, '增益' | '起帧'> & { from: number; gainAt: (f: number) => number }) => {};
  const offset = seq ? seq.cumulatedFrom + seq.relativeFrom : 0;
  const first = seq ? offset - seq.cumulatedNegativeFrom : 0;
  const end = Math.min(compFrames, seq ? offset + seq.durationInFrames : Infinity);
  return ({ from, gainAt, ...clip }: Omit<SfxClipLog, '增益' | '起帧'> & { from: number; gainAt: (f: number) => number }) => {
    const skip = Math.max(0, first - (offset + from));
    const start = offset + from + skip;
    const frames = Math.min(clip.帧数 - skip, end - start);
    if (frames <= 0) return;
    const entry: SfxClipLog = { ...clip, 起帧: start, 帧数: frames, 入点秒: clip.入点秒 + (skip / fps) * clip.速率, 增益: Array.from({ length: frames }, (_, f) => Math.round(gainAt(f + skip) * 1e6) / 1e6) };
    const line = `${kind} ${JSON.stringify(entry)}`;
    if (logged.has(line)) return;
    logged.add(line);
    console.log(line);
  };
};
