// 6-2-5至6-3-3 飞越主世界俯冲边城：照旧 6-2至6-3段界/段表.ts 的 6-2-5至6-3-3 截表，把旧段组件按 [从, 到) 拼起来（6-3-2 用带思索界面的整片版），
// 截表的数是各段的段内秒（段界那一格归上一段）；声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { SegmentStitch } from '@engine/core/拼段.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import { FlyOverworld } from '../../地点/边城/6-2-5/飞越主世界.tsx';
import { BorderTownAhead } from './6-2-6/边城在望.tsx';
import { BackToBorderTown } from './6-3-1/又回到边城.tsx';
import { RollerPonder } from './6-3-2/思索.tsx';
import { DiveIn } from './6-3-3/俯冲.tsx';
import { segmentPlaySec as playSec625 } from '../../地点/边城/6-2-5/编排/时间线.ts';
import { lastCellSec, segPlaySec } from '../../地点/边城/6-3-下坠/时间线.ts';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

const cuts = [
  { 段: '6-2-5', picture: FlyOverworld, 从: 0, 到: playSec625('6-2-5') },
  { 段: '6-2-6', picture: BorderTownAhead, 从: lastCellSec, 到: playSec625('6-2-6') },
  { 段: '6-3-1', picture: BackToBorderTown, 从: lastCellSec, 到: segPlaySec('6-3-1') },
  { 段: '6-3-2', picture: RollerPonder, 从: lastCellSec, 到: segPlaySec('6-3-2') },
  { 段: '6-3-3', picture: DiveIn, 从: lastCellSec, 到: segPlaySec('6-3-3') },
];

export default definePicture(seg, soundUrl, () => <SegmentStitch cuts={cuts} 每秒={1} />);
