import { describe, expect, it } from 'vitest';
import { intersects, transformColumn } from './照抄.ts';

describe('真实来源地块', () => {
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
