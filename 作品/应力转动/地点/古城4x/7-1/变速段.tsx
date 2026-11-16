// 变速的打斗段（7-1-3、7-1-5、7-1-7、7-3-3；用户 10-17 嫌和监守者缠斗的场面僵，对照《设身处地10》改）共用的：机位表、画面。
// 声音照各段 段.ts 的 cue 放（原生段，决策 0015；cue 是照基线声音清单转写的，变速后的落点已在里面）。
// 机位按场时刻切（切在动作上）；每个镜头的 pos、tgt、lens 是场时刻 t 的函数。
// 不加游戏里没有的特效（用户 10-06），力量只靠机位、变速、停顿；打中不震屏、不推焦（用户 10-18 嫌冲击镜头不好，全删）。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { useCurrentSec } from '@engine/段/时间.tsx';
import type { SpeedRamp } from './变速.ts';
import { ScenePicture } from './画面.tsx';
import type { Cam } from '@engine/core/机位.ts';

export type SpeedRampShot = { 起: number; cam: (t: number) => Cam };
export const buildCameraRig = (v: SpeedRamp, shots: SpeedRampShot[]) => {
  const shotIndex = (t: number) => {
    let i = 0;
    while (i + 1 < shots.length && t >= shots[i + 1].起) i++;
    return i;
  };
  return (sec: number): Cam => {
    const t = v.storyTime(sec);
    return shots[shotIndex(t)].cam(t);
  };
};

type ScenePictureComponent = React.FC<{ t: number; cam: Cam; width: number; height: number }>;
// 一段的画面：段内秒 → 场时刻 t，按本段的变速和机位画。7-1 用本场的 ScenePicture（默认），7-3 传自己的
export const SpeedRampSegment: React.FC<{ v: SpeedRamp; camera: (sec: number) => Cam; Picture?: ScenePictureComponent }> = ({ v, camera, Picture = ScenePicture }) => {
  const sec = useCurrentSec();
  const { width, height } = useVideoConfig();
  return <Picture t={v.storyTime(sec)} cam={camera(sec)} width={width} height={height} />;
};
