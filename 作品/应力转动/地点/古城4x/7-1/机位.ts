// 第 7 章第 1 场各段机位的小工具：一段 = 几个硬切的镜头，每个镜头的 pos、tgt 是关键帧（段内秒）或者按段内秒算的函数（跟拍）。
import { sample, sampleV, type Key, type VKey } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import * as timeline from './时间线.ts';
import type { Cam } from '@engine/core/机位.ts';

export type ShotCam = { start: number; pos: VKey[] | ((sec: number) => V3); tgt: VKey[] | ((sec: number) => V3); lens: Key[] };
const resolveKey = (v: VKey[] | ((sec: number) => V3), sec: number): V3 => (typeof v === 'function' ? v(sec) : (sampleV(v, sec) as V3));
export const camPoses = (shots: ShotCam[]) => {
  const shotIndex = (sec: number) => {
    let i = 0;
    while (i + 1 < shots.length && sec >= shots[i + 1].start) i++;
    return i;
  };
  const camera = (sec: number): Cam => {
    const shot = shots[shotIndex(sec)];
    return { pos: resolveKey(shot.pos, sec), tgt: resolveKey(shot.tgt, sec), lens: sample(shot.lens, sec) };
  };
  return { shotIndex: shotIndex, camera };
};
export const addOffset = (a: V3, b: number[]): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
// 场时刻 t 落在某段的第几秒（切点按剧情时刻写；取整到旧编排 1/24 秒的格上）
export const localSecAt = (segId: timeline.SegmentId, t: number) => Math.round((t - timeline.segmentStartT(segId)) * 24) / 24;
