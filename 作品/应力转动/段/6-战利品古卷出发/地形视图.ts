// 6-战利品古卷出发 的地形视图：照 截表.ts 换成截里的时钟；6-2-1～6-2-3 是 BasePlanSegment（全局秒 = 段起 + 截内秒），6-2-4 是 SetOff（段内秒）
import { clockInStitch, stitchSpans } from '@engine/core/拼段时序.ts';
import { segFps } from '@engine/段/段定义.ts';
import { defineTerrainView } from '@engine/voxel/地形视图.ts';
import { basePlanTerrainView, setOffTerrainView } from './6-2-1/地形视图.ts';
import { segmentTable } from './6-2-1/编排/时间线.ts';
import seg from './段.ts';
import { cuts, perSec } from './截表.ts';

const spans = stitchSpans(cuts, perSec, segFps);
const aspect = seg.width / seg.height;
export default defineTerrainView({
  width: seg.width,
  height: seg.height,
  at: (_sec, top) => {
    const hit = clockInStitch(spans, top);
    if (!hit) return [];
    const { segment } = hit.cut, { clock } = hit;
    const views = segment === '6-2-4' ? setOffTerrainView(clock.sec, clock, aspect) : basePlanTerrainView(segmentTable[segment].start + clock.sec, clock, aspect);
    return views.map((v) => ({ ...v, canvas: `${segment}:${v.canvas}` }));
  },
});
