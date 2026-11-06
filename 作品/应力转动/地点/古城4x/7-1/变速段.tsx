// 变速的打斗段（7-1-3、7-1-5、7-1-7、7-3-3；用户 10-17 嫌和监守者缠斗的场面僵，对照《设身处地10》改）共用的：机位表、画面。
// 声音照各段 段.ts 的 cue 放（原生段，决策 0015；cue 是照基线声音清单转写的，变速后的落点已在里面）。
// 机位按场时刻切（切在动作上）；每个镜头的 pos、tgt、lens 是场时刻 t 的函数。
// 不加游戏里没有的特效（用户 10-06），力量只靠机位、变速、停顿；打中不震屏、不推焦（用户 10-18 嫌冲击镜头不好，全删）。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { use当前秒 } from '@engine/段/时间.tsx';
import type { Cam } from '../6-4-1/古城画面.tsx';
import type { 变速 } from './变速.ts';
import { ScenePicture } from './画面.tsx';

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

type 场画面 = React.FC<{ t: number; cam: Cam; width: number; height: number }>;
// 一段的画面：段内格（1/24 秒一格，带小数）→ 场时刻 t，按本段的变速和机位画。7-1 用本场的 ScenePicture（默认），7-3 传自己的
export const 变速段: React.FC<{ v: 变速; camera: (frame: number) => Cam; Picture?: 场画面 }> = ({ v, camera, Picture = ScenePicture }) => {
  const frame = use当前秒() * v.FPS;
  const { width, height } = useVideoConfig();
  return <Picture t={v.剧情时间(frame)} cam={camera(frame)} width={width} height={height} />;
};
