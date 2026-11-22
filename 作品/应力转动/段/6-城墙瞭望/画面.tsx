// 6-3-4 城墙瞭望：照 截表.ts 拼起来；声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { SegmentStitch } from '@engine/core/拼段.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import { CityWatch } from './城防.tsx';
import segment from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { cuts, perSec } from './截表.ts';

const pictureCuts = cuts.map((c) => ({ ...c, picture: CityWatch }));

export default definePicture(segment, soundUrl, () => <SegmentStitch cuts={pictureCuts} perSec={perSec} />);
