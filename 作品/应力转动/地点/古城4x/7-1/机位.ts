// 第 7 章第 1 场各段机位的小工具：一段 = 几个硬切的镜头，每个镜头的 pos、tgt 是关键帧（段内秒）或者按段内秒算的函数（跟拍）。
import { sample, sampleV, type Key, type VKey } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { seenSecToFrameSec } from './旧格对帧.ts';
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
// 场时刻 t 落在段内第几秒（切点按剧情时刻写，落到帧上：见 旧格对帧.ts）；segmentStartT 是段首的场时刻
export const localSecAt = (segmentStartT: number, t: number) => seenSecToFrameSec(t - segmentStartT);
