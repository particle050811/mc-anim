// 6-3-5至6 的截表（画面.tsx 和 地形视图.ts 共用）：照旧 6-2至6-3段界/段表.ts 的 6-3-5至6 截表，数是下坠时间线上的段内秒（段界那一帧归上一段，见 时间线.ts 的 `boundaryFrameSec`）
import { boundaryFrameSec, segPlaySec } from '../../地点/边城/6-3-下坠/时间线.ts';

export const cuts = [
  { segment: '6-3-5', 从: 0, dest: segPlaySec('6-3-5') },
  { segment: '6-3-6', 从: boundaryFrameSec, dest: segPlaySec('6-3-6') },
] as const;
export const perSec = 1;
