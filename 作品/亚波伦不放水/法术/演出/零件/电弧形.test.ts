import { describe, expect, it } from 'vitest';
import { generateArc, visibleSegRange, arcPresets, defaultSegCount } from './电弧形.ts';

describe('电弧形', () => {
  const startPos = [0, 0, 5] as const;
  const end = [9, 0, 1] as const;
  it('段数 = (int)sqrt(距离 × 100)，不分叉时一段接一段到终点附近', () => {
    expect(defaultSegCount(startPos, end)).toBe(Math.floor(Math.sqrt(Math.hypot(9, 4) * 100)));
    const arcSegs = generateArc(startPos, end, arcPresets.shock, 1);
    // 每段进度约 1/段数（±10%），所以段数在 默认段数 上下一成里
    expect(arcSegs.length).toBeGreaterThan(defaultSegCount(startPos, end) * 0.9);
    expect(arcSegs.length).toBeLessThan(defaultSegCount(startPos, end) * 1.12);
    expect(arcSegs[0]![0]).toEqual([0, 0, 5]);
    // 正弦散开：到头时散开 ≤ 0，最后一段落在终点上
    const lastPoint = arcSegs[arcSegs.length - 1]![1]!;
    expect(Math.hypot(lastPoint[0] - 9, lastPoint[1], lastPoint[2] - 1)).toBeLessThan(1e-9);
    for (const seg of arcSegs) expect(seg.length).toBe(16);
  });
  it('同一个种子形状一样，换种子不一样', () => {
    expect(generateArc(startPos, end, arcPresets.thunderBolt, 7)).toEqual(generateArc(startPos, end, arcPresets.thunderBolt, 7));
    expect(generateArc(startPos, end, arcPresets.thunderBolt, 7)).not.toEqual(generateArc(startPos, end, arcPresets.thunderBolt, 8));
  });
  it('淡入淡出：前一半从起点长出来，后一半从起点消失', () => {
    expect(visibleSegRange(30, 0)).toEqual([0, 0]);
    expect(visibleSegRange(30, 0.25)).toEqual([0, 15]);
    expect(visibleSegRange(30, 0.5)).toEqual([0, 30]);
    expect(visibleSegRange(30, 0.75)).toEqual([15, 30]);
  });
});
