// 第 1 场 6-1-1～6-1-4至9 各段的地形视图（engine/voxel/地形视图.ts）：照 段界.ts 的截换成截里的时钟，再交给各源组件的视图（同 分段.tsx 的拼法）
import { clockInStitch, stitchSpans, type SeqClock } from '@engine/core/拼段时序.ts';
import { segFps, type SegmentDef } from '@engine/段/段定义.ts';
import { defineTerrainView, type TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { enterForestTerrainView } from '../6-1-1/机位.ts';
import { official } from '../6-1-2/动作改进.ts';
import { nagaTerrainView } from '../6-1-2/机位.ts';
import { takeOffTerrainView } from '../6-1-3/机位.ts';
import { onerSegmentFarView, onerTerrainView } from '../一镜到底/地形视图.ts';
import { clipsOf, CUT_STEPS_PER_SEC, type SegmentId, type SegmentSource } from './段界.ts';

const sourceViews: Record<SegmentSource, (clock: SeqClock, aspect: number) => TerrainCanvasView[]> = {
  '6-1-1': (clock) => enterForestTerrainView(clock.sec),
  '6-1-2': (clock) => nagaTerrainView(official, clock.sec),
  '6-1-3': (clock, aspect) => takeOffTerrainView(clock, aspect),
  // 一镜到底的源时间就是它的画面时间 g（分段.tsx 的 Oner：OnerSegment start 0）
  一镜到底: (clock, aspect) => onerTerrainView({ g: clock.sec, farView: onerSegmentFarView, aspect, clock }),
};

export const scene1TerrainView = (id: SegmentId, seg: SegmentDef) => {
  const spans = stitchSpans(clipsOf(id), CUT_STEPS_PER_SEC, segFps);
  const aspect = seg.width / seg.height;
  return defineTerrainView({
    width: seg.width,
    height: seg.height,
    at: (_sec, top) => {
      const hit = clockInStitch(spans, top);
      if (!hit) return [];
      // 每截一块新画布（航线定级表按画布留）
      return sourceViews[hit.cut.segment](hit.clock, aspect).map((v) => ({ ...v, canvas: `${hit.cut.segment}@${hit.cut.从}:${v.canvas}` }));
    },
  });
};
