// 变速的打斗段（7-1-3、7-1-5、7-1-7、7-3-3；用户 10-17 嫌和监守者缠斗的场面僵，对照《设身处地10》改）共用的：机位表、画面、声音。
// 机位按场时刻切（切在动作上）；每个镜头的 pos、tgt、lens 是场时刻 t 的函数。
// 不加游戏里没有的特效（用户 10-06），力量只靠机位、变速、停顿；打中不震屏、不推焦（用户 10-18 嫌冲击镜头不好，全删）。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { GameSoundTrack, type SoundCue } from '@engine/audio/游戏音效.tsx';
import { scheduleToScreen } from '@engine/audio/慢放.ts';
import { LineTrack } from '../../../配音/台词轨.tsx';
import type { Cam } from '../6-4-1/古城画面.tsx';
import type { 变速 } from './变速.ts';
import { ScenePicture } from './画面.tsx';
import { sceneSounds } from './声音.tsx';
import * as timeline from './时间线.ts';

export type 变速镜 = { 起: number; cam: (t: number) => Cam };
export const 建机位 = (v: 变速, shots: 变速镜[]) => {
  const shotIndex = (t: number) => {
    let i = 0;
    while (i + 1 < shots.length && t >= shots[i + 1].起) i++;
    return i;
  };
  return (frame: number): Cam => {
    const t = v.剧情时间(frame);
    return shots[shotIndex(t)].cam(t);
  };
};

type 场声音 = Omit<SoundCue, '帧'> & { t: number; 止t?: number }; // 止t 见 ./声音.tsx
// 台词开口在本段第几帧（工具/合成第六章/台词落点.ts 同用）
export const lineFrameIn = (v: 变速, t: number) => {
  const startT = v.剧情时间(0);
  return t < startT ? Math.round((t - startT) * v.FPS) : Math.round(v.帧小数(t));
};
type 场画面 = React.FC<{ t: number; cam: Cam; width: number; height: number }>;
// 一段：画面、声音、台词都按本段的变速排。7-1 用本场的（默认，台词给段号取 `segmentLines`），7-3 传自己的（7-3-3/画面.tsx）。tailFade：下一段硬切到别处时给（见 GameSoundTrack）
// 台词开口在段头之前的（上一段说进来的后半截）照原速往前推帧（段头之前不变速）
export const 变速段: React.FC<{ v: 变速; camera: (frame: number) => Cam; segId?: timeline.SegmentId; Picture?: 场画面; sounds?: 场声音[]; lines?: { id: string; t: number }[]; tailFade?: boolean }> = ({
  v,
  camera,
  segId,
  Picture = ScenePicture,
  sounds = sceneSounds,
  lines,
  tailFade = false,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const startT = v.剧情时间(0);
  const endT = v.剧情时间(v.总帧数 - 1);
  // 开头前 3 秒响起的从中间接着放；落在段里的按变速重排（慢放里的声音按画面时间原速放，见 音效/慢放.ts）
  const stopFrame = (止t: number | undefined) => (止t === undefined ? {} : { 止帧: 止t < startT ? (止t - startT) * v.FPS : 止t > endT ? Infinity : v.帧小数(止t) });
  const before = sounds.filter((s) => s.t < startT && s.t >= startT - 3).map(({ t, 止t, ...s }) => ({ ...s, 帧: (t - startT) * v.FPS, ...stopFrame(止t) }));
  // 慢放回原速后「接着放」的余音照游戏规则跟着远近走（慢放.ts 的本意）：不给档会按档放响，7-1-3 拍4 的余音会重放一遍、压在刘心忠那句台词上
  const inside = scheduleToScreen(
    sounds.filter((s) => s.t >= startT && s.t <= endT).map(({ t, 止t, ...s }) => ({ ...s, T: t, ...stopFrame(止t) })),
    v,
  ).map((s) => ((s.起点 ?? 0) > 0 && s.档 === undefined && s.响度 === undefined ? { ...s, 档: '细节' as const } : s));
  const listener = (f: number) => camera(Math.min(Math.max(Math.round(f), 0), v.总帧数 - 1)).pos;
  // 传了 lines 的只放本段开口的；7-1 的 `segmentLines` 自带上一段说进来的后半截
  const lineList = lines ? lines.filter((l) => l.t >= startT) : segId ? timeline.segmentLines(segId) : [];
  const lineCues = lineList.filter((l) => l.t < endT).map((l) => ({ id: l.id, 帧: lineFrameIn(v, l.t) }));
  return (
    <>
      <Picture t={v.剧情时间(frame)} cam={camera(frame)} width={width} height={height} />
      <GameSoundTrack sounds={[...before, ...inside]} listener={listener} tailFade={tailFade} />
      <LineTrack 句们={lineCues} />
    </>
  );
};
