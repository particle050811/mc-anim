// 6-2-1至4 战利品古卷出发：把四个段组件按 [从, 到) 拼起来，截表的数是刻（1/120 秒）；后一个的第 0 秒接着前一个的段尾；
// 声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { SegmentStitch } from '@engine/core/拼段.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import { Loot } from './6-2-1/战利品.tsx';
import { WhatElse } from './6-2-2/还差什么.tsx';
import { AncientScroll } from './6-2-3/古卷.tsx';
import { SetOff } from './6-2-4/出发.tsx';
import { segmentTable } from './6-2-1/编排/时间线.ts';
import { DURATION as duration624 } from './6-2-4/编排.ts';
import segment from './段.ts';
import soundUrl from './声音地址.生成.ts';

const TICKS_PER_SEC = 120;
// 往上取到刻上（只收浮点零头）
const ticksOf = (sec: number) => Math.ceil(sec * TICKS_PER_SEC - 1e-6);
const cuts = [
  { segment: '6-2-1', picture: Loot, 从: 0, dest: ticksOf(segmentTable['6-2-1'].length) },
  { segment: '6-2-2', picture: WhatElse, 从: 0, dest: ticksOf(segmentTable['6-2-2'].length) },
  { segment: '6-2-3', picture: AncientScroll, 从: 0, dest: ticksOf(segmentTable['6-2-3'].length) },
  { segment: '6-2-4', picture: SetOff, 从: 0, dest: ticksOf(duration624) },
];

export default definePicture(segment, soundUrl, () => <SegmentStitch cuts={cuts} perSec={TICKS_PER_SEC} />);
