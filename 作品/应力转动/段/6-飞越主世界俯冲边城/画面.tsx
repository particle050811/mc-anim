// 6-2-5至6-3-3 飞越主世界俯冲边城：照 截表.ts 把旧段组件按 [从, 到) 拼起来；声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { SegmentStitch } from '@engine/core/拼段.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import { FlyOverworld } from '../../地点/边城/6-2-5/飞越主世界.tsx';
import { BorderTownAhead } from './6-2-6/边城在望.tsx';
import { BackToBorderTown } from './6-3-1/又回到边城.tsx';
import { RollerPonder } from './6-3-2/思索.tsx';
import { DiveIn } from './6-3-3/俯冲.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { cuts, perSec } from './截表.ts';

// 6-3-2 用带思索界面的整片版
const pictures = { '6-2-5': FlyOverworld, '6-2-6': BorderTownAhead, '6-3-1': BackToBorderTown, '6-3-2': RollerPonder, '6-3-3': DiveIn };
const pictureCuts = cuts.map((c) => ({ ...c, picture: pictures[c.segment] }));

export default definePicture(seg, soundUrl, () => <SegmentStitch cuts={pictureCuts} perSec={perSec} />);
