// 6-2-1至4 战利品古卷出发：照 截表.ts 把四个段组件按 [从, 到) 拼起来；
// 声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { SegmentStitch } from '@engine/core/拼段.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import { Loot } from './6-2-1/战利品.tsx';
import { WhatElse } from './6-2-2/还差什么.tsx';
import { AncientScroll } from './6-2-3/古卷.tsx';
import { SetOff } from './6-2-4/出发.tsx';
import segment from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { cuts, perSec } from './截表.ts';

const pictures = { '6-2-1': Loot, '6-2-2': WhatElse, '6-2-3': AncientScroll, '6-2-4': SetOff };
const pictureCuts = cuts.map((c) => ({ ...c, picture: pictures[c.segment] }));

export default definePicture(segment, soundUrl, () => <SegmentStitch cuts={pictureCuts} perSec={perSec} />);
