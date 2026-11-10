import { describe, expect, it } from 'vitest';
import { 生成电弧, 电弧可见段, 电弧预设, 默认段数 } from './电弧形.ts';

describe('电弧形', () => {
  const 起 = [0, 0, 5] as const;
  const 终 = [9, 0, 1] as const;
  it('段数 = (int)sqrt(距离 × 100)，不分叉时一段接一段到终点附近', () => {
    expect(默认段数(起, 终)).toBe(Math.floor(Math.sqrt(Math.hypot(9, 4) * 100)));
    const 段 = 生成电弧(起, 终, 电弧预设.shock, 1);
    // 每段进度约 1/段数（±10%），所以段数在 默认段数 上下一成里
    expect(段.length).toBeGreaterThan(默认段数(起, 终) * 0.9);
    expect(段.length).toBeLessThan(默认段数(起, 终) * 1.12);
    expect(段[0]![0]).toEqual([0, 0, 5]);
    // 正弦散开：到头时散开 ≤ 0，最后一段落在终点上
    const 末 = 段[段.length - 1]![1]!;
    expect(Math.hypot(末[0] - 9, 末[1], 末[2] - 1)).toBeLessThan(1e-9);
    for (const 一段 of 段) expect(一段.length).toBe(16);
  });
  it('同一个种子形状一样，换种子不一样', () => {
    expect(生成电弧(起, 终, 电弧预设.thunderBolt, 7)).toEqual(生成电弧(起, 终, 电弧预设.thunderBolt, 7));
    expect(生成电弧(起, 终, 电弧预设.thunderBolt, 7)).not.toEqual(生成电弧(起, 终, 电弧预设.thunderBolt, 8));
  });
  it('淡入淡出：前一半从起点长出来，后一半从起点消失', () => {
    expect(电弧可见段(30, 0)).toEqual([0, 0]);
    expect(电弧可见段(30, 0.25)).toEqual([0, 15]);
    expect(电弧可见段(30, 0.5)).toEqual([0, 30]);
    expect(电弧可见段(30, 0.75)).toEqual([15, 30]);
  });
});
