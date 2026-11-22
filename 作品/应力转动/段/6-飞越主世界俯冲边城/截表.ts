// 6-2-5至6-3-3 的截表（画面.tsx 和 地形视图.ts 共用）：照旧 6-2至6-3段界/段表.ts 的 6-2-5至6-3-3 截表，数是各段的段内秒（段界那一帧归上一段）
import { segmentPlaySec as playSec625 } from '../../地点/边城/6-2-5/编排/时间线.ts';
import { boundaryFrameSec, segPlaySec } from '../../地点/边城/6-3-下坠/时间线.ts';

export const cuts = [
  { segment: '6-2-5', 从: 0, dest: playSec625('6-2-5') },
  { segment: '6-2-6', 从: boundaryFrameSec, dest: playSec625('6-2-6') },
  { segment: '6-3-1', 从: boundaryFrameSec, dest: segPlaySec('6-3-1') },
  { segment: '6-3-2', 从: boundaryFrameSec, dest: segPlaySec('6-3-2') },
  { segment: '6-3-3', 从: boundaryFrameSec, dest: segPlaySec('6-3-3') },
] as const;
export const perSec = 1;
