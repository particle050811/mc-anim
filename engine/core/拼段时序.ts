// 拼段（拼段.tsx 的 SegmentStitch）每一截的帧位，和截里的组件看到的时钟。纯模块：加载计划在 Node 里照它换时钟（engine/voxel/地形视图.ts）。
// 时钟照 Remotion 4.0.537 的 Sequence（playbackRate 1、不 loop、没有外层 Sequence）：截里 useCurrentFrame = 帧 − from + trimBefore；
// useVideoConfig().durationInFrames = 露出的帧数 + trimBefore（engine/段/时间.tsx 的 useSecLeft 用它）；useSecSinceStart 从露出的第一帧算起。升 Remotion 要重核。

export type Clip = { segment: string; 从: number; dest: number };
export type ClipSpan<C extends Clip = Clip> = { cut: C; from: number; durationInFrames: number; trimBefore: number };

/** 每截 [从, 到) 首尾相接；从、到以 1/perSec 秒为一格，按 fps 换成帧（可以落在两帧之间） */
export const stitchSpans = <C extends Clip>(cuts: readonly C[], perSec: number, fps: number): ClipSpan<C>[] => {
  const k = fps / perSec;
  let at = 0;
  return cuts.map((cut) => {
    const from = at;
    at += cut.dest - cut.从;
    return { cut, from: from * k, durationInFrames: (cut.dest - cut.从) * k, trimBefore: cut.从 * k };
  });
};

/** 组件这一帧看到的时间（同 engine/段/时间.tsx 的 useCurrentSec、useSecLeft、useSecSinceStart；frames = 这一层的 durationInFrames） */
export type SeqClock = { frame: number; frames: number; fps: number; sec: number; secLeft: number; secSinceStart: number };

export const topClock = (frame: number, frames: number, fps: number): SeqClock => ({ frame, frames, fps, sec: frame / fps, secLeft: Math.max(0, frames - 1 - frame) / fps, secSinceStart: frame / fps });

/** 段的第 top.frame 帧落在哪一截、截里的时钟；落在缝外（不该有）给 null */
export const clockInStitch = <C extends Clip>(spans: readonly ClipSpan<C>[], top: SeqClock): { cut: C; clock: SeqClock } | null => {
  const f = top.frame;
  for (const s of spans) {
    // Remotion 的 getSequenceBoundaryTolerance
    const tol = Math.min(s.durationInFrames / 2, Number.EPSILON * Math.max(Math.abs(f), Math.abs(s.from)) * 4);
    if (!(f - s.from >= -tol && f - (s.from + s.durationInFrames) < -tol)) continue;
    const inner = f - s.from + s.trimBefore;
    const frames = Math.max(0, Math.min(top.frames - s.from, s.durationInFrames)) + s.trimBefore;
    const first = Math.max(0, s.trimBefore);
    return { cut: s.cut, clock: { frame: inner, frames, fps: top.fps, sec: inner / top.fps, secLeft: Math.max(0, frames - 1 - inner) / top.fps, secSinceStart: Math.max(0, inner - first) / top.fps } };
  }
  return null;
};
