// 第 7 章第 1 场各段机位的小工具：一段 = 几个硬切的镜头，每个镜头的 pos、tgt 是关键帧（段内帧）或者按帧算的函数（跟拍）。
import { sample, sampleV, type Key, type VKey } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { Cam } from '../6-4-1/古城画面.tsx';
import * as timeline from './时间线.ts';

export type ShotCam = { start: number; pos: VKey[] | ((frame: number) => V3); tgt: VKey[] | ((frame: number) => V3); lens: Key[] };
const resolveKey = (v: VKey[] | ((frame: number) => V3), f: number): V3 => (typeof v === 'function' ? v(f) : (sampleV(v, f) as V3));
export const camPoses = (shots: ShotCam[]) => {
  const shotIndex = (frame: number) => {
    let i = 0;
    while (i + 1 < shots.length && frame >= shots[i + 1].start) i++;
    return i;
  };
  const camera = (frame: number): Cam => {
    const shot = shots[shotIndex(frame)];
    return { pos: resolveKey(shot.pos, frame), tgt: resolveKey(shot.tgt, frame), lens: sample(shot.lens, frame) };
  };
  return { 镜号: shotIndex, camera };
};
export const addOffset = (a: V3, b: number[]): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
// 场时刻 t 落在某段的第几帧（切点按剧情时刻写）
export const frameAt = (segId: timeline.SegmentId, t: number) => Math.round((t - timeline.segmentStartT(segId)) * timeline.FPS);
// 跟拍：主体（场景脚底，按场时刻）+ 偏移
export const follow = (segId: timeline.SegmentId, subject: (t: number) => V3, offset: number[]) => (f: number): V3 => addOffset(subject(timeline.tAt(segId, f)), offset);
