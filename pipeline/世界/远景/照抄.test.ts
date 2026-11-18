import { describe, expect, it } from 'vitest';
import { intersects, landmarkState, sampleIndex, transformColumn } from './照抄.ts';

describe('真实来源地块', () => {
  it('巨人小屋连云底一起排除，普通林冠仍可照抄', () => {
    for (const state of ['giant_leaves[persistent=true]', 'fluffy_cloud', 'wispy_cloud', 'giant_log']) expect(landmarkState(`twilightforest:${state}`)).toBe(true);
    expect(landmarkState('twilightforest:canopy_leaves')).toBe(false);
  });
  it('有多个来源时，相邻样地使用不相交的来源池', () => {
    for (const count of [1, 2, 3, 48]) for (const roll of [0, 0.5, 0.99999]) {
      const index = sampleIndex(count, -2, 3, roll);
      expect(index).toBeLessThan(count);
      if (count > 1) for (const [x,y] of [[-1,3],[-2,2]] as const) expect(sampleIndex(count,x,y,0.99999-roll) % 2).not.toBe(index % 2);
    }
  });
  it('八种姿态各自一一映射，不把转过的行抄成同一列', () => {
    const poses = Array.from({ length: 8 }, (_, pose) => Array.from({ length: 256 }, (_, index) => transformColumn(index % 16, index >> 4, pose)));
    expect(new Set(poses.map(pose => pose.join(','))).size).toBe(8);
    for (const pose of poses) expect([...pose].sort((left, right) => left - right)).toEqual(poses[0]);
  });

  it('以游戏坐标排除碰到结构或留出区的整块，不误排负坐标另一边', () => {
    const origin: [number, number, number] = [-6144, 0, 2048];
    const id = { L: 3, i: -1, j: 1 };
    expect(intersects(id, origin, [[-6145, 1024, -6145, 1024]])).toBe(true);
    expect(intersects(id, origin, [[-6144, 1024, -6144, 1024], [-6200, 1536, -6200, 1536]])).toBe(false);
  });
});
