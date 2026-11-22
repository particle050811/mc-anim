// 6-城墙瞭望 的地形视图：照 截表.ts 换成截里的时钟，下坠时间线（FallSegment：全局秒 = 段起 + 截内秒）
import { clockInStitch, stitchSpans } from '@engine/core/拼段时序.ts';
import { segFps } from '@engine/段/段定义.ts';
import { defineTerrainView } from '@engine/voxel/地形视图.ts';
import { fallTerrainView } from '../../场/6-边城/6-3-下坠/地形视图.ts';
import { segTable } from '../../地点/边城/6-3-下坠/时间线.ts';
import seg from './段.ts';
import { cuts, perSec } from './截表.ts';

const spans = stitchSpans(cuts, perSec, segFps);
export default defineTerrainView({
  width: seg.width,
  height: seg.height,
  at: (_sec, top) => {
    const hit = clockInStitch(spans, top);
    return hit ? fallTerrainView(segTable[hit.cut.segment].start + hit.clock.sec, hit.clock, seg.width / seg.height) : [];
  },
});
