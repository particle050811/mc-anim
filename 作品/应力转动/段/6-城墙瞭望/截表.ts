// 6-3-4 的截表（画面.tsx 和 地形视图.ts 共用）：照旧 6-2至6-3段界/段表.ts 的 6-3-4 截表，数是下坠时间线上的段内秒
import { segPlaySec } from '../../地点/边城/6-3-下坠/时间线.ts';

export const cuts = [{ segment: '6-3-4', 从: 0, dest: segPlaySec('6-3-4') }] as const;
export const perSec = 1;
