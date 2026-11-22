// 6-3-5至6 举锤砸穿：照 截表.ts 拼起来；声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { SegmentStitch } from '@engine/core/拼段.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import { RaiseMace } from './6-3-5/举锤.tsx';
import { SmashThrough } from './6-3-6/砸穿.tsx';
import segment from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { cuts, perSec } from './截表.ts';

const pictures = { '6-3-5': RaiseMace, '6-3-6': SmashThrough };
const pictureCuts = cuts.map((c) => ({ ...c, picture: pictures[c.segment] }));

export default definePicture(segment, soundUrl, () => <SegmentStitch cuts={pictureCuts} perSec={perSec} />);
