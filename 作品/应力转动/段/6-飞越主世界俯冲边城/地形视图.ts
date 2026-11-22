// 6-飞越主世界俯冲边城 的地形视图：照 截表.ts 换成截里的时钟。6-2-5、6-2-6 是飞越航线（FlightView），6-3-1～6-3-3 是下坠时间线（FallScene）；
// 6-3-2 思索整层盖满时不画世界（世界层.ts），6-3-3 开头叠的思索层不画世界
import { clockInStitch, stitchSpans } from '@engine/core/拼段时序.ts';
import { segFps } from '@engine/段/段定义.ts';
import { defineTerrainView, type TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { flyoverTerrainView } from '../../地点/边城/6-2-5/地形视图.ts';
import { segmentTable } from '../../地点/边城/6-2-5/编排.ts';
import { fallTerrainView } from '../../场/6-边城/6-3-下坠/地形视图.ts';
import { segTable } from '../../地点/边城/6-3-下坠/时间线.ts';
import { ponderLayerAt } from '../../地点/边城/6-3-2/世界层.ts';
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
    let views: TerrainCanvasView[];
    if (segment === '6-2-5' || segment === '6-2-6') views = flyoverTerrainView(segmentTable[segment].start + clock.sec, clock, aspect);
    else if (segment === '6-3-2') views = ponderLayerAt(clock.sec).layerOpacity < 1 ? fallTerrainView(segTable['6-3-2'].start + clock.sec, clock, aspect) : [];
    else views = fallTerrainView(segTable[segment].start + clock.sec, clock, aspect);
    return views.map((v) => ({ ...v, canvas: `${segment}:${v.canvas}` }));
  },
});
