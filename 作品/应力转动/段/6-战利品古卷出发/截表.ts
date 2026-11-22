// 6-2-1至4 的截表（画面.tsx 和 地形视图.ts 共用）：截表的数是刻（1/120 秒），后一个的第 0 秒接着前一个的段尾
import { segmentTable } from './6-2-1/编排/时间线.ts';
import { DURATION as duration624 } from './6-2-4/编排.ts';

export const perSec = 120;
// 往上取到刻上（只收浮点零头）
const ticksOf = (sec: number) => Math.ceil(sec * perSec - 1e-6);
export const cuts = [
  { segment: '6-2-1', 从: 0, dest: ticksOf(segmentTable['6-2-1'].length) },
  { segment: '6-2-2', 从: 0, dest: ticksOf(segmentTable['6-2-2'].length) },
  { segment: '6-2-3', 从: 0, dest: ticksOf(segmentTable['6-2-3'].length) },
  { segment: '6-2-4', 从: 0, dest: ticksOf(duration624) },
] as const;
