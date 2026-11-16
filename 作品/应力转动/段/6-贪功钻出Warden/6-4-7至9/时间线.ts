// 6-4-7至9 贪功钻出Warden：6-4-7 贪功末尾挪到二人身后的机位不切，就是 6-4-8 钻出（一个镜头），6-4-9 第一镜又从 6-4-8 末帧机位接着推，
// 一个镜头不拆进两段（用户 10-18 定），三截合成一段。各截的戏、机位照旧在 ../6-4-7/、../6-4-8/、../6-4-9/（编排按各自的段内秒）。
// 6-4-8 首帧 = 6-4-7 末帧（契约 衔接.六四八首），6-4-9 首帧 = 6-4-8 末帧（6-4-9/编排.ts 的 `sec648`），合进来都从它们的下一格（1/24 秒）起，不重复那一帧。
import * as K647 from '../6-4-7/编排.ts';
import * as K648 from '../../../地点/古城4x/6-4-8/编排.ts';
import * as K649 from '../../../地点/古城4x/6-4-9/编排.ts';
import { snapSec } from '../../../地点/古城4x/6-4-1/古城戏.ts';

const GRID = 1 / 24;
// 每截：在合成段里占几秒、从它自己的第几秒起
export const parts = [
  { id: '6-4-7', sec: K647.durationSec, firstSec: 0 },
  { id: '6-4-8', sec: K648.durationSec - GRID, firstSec: GRID },
  { id: '6-4-9', sec: K649.durationSec - GRID, firstSec: GRID },
] as const;
export type PartId = (typeof parts)[number]['id'];
export const partStartSec: Record<PartId, number> = (() => {
  const out = {} as Record<PartId, number>;
  let acc = 0;
  for (const part of parts) {
    out[part.id] = acc;
    acc += part.sec;
  }
  return out;
})();
export const totalSec = parts.reduce((n, p) => n + p.sec, 0);
// 合成段的秒 → 落在哪一截、那一截的段内秒（截界落在输出帧上时那一帧算后一截）
export const partAt = (sec: number): { id: PartId; t: number } => {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (sec >= partStartSec[part.id] - 1e-9 || i === 0) return { id: part.id, t: snapSec(sec - partStartSec[part.id] + part.firstSec) };
  }
  throw new Error('unreachable');
};
