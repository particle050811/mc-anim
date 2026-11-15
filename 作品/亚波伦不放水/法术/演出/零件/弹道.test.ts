import { describe, expect, it } from 'vitest';
import { hitTick, trajectoryPos, throwTo, parabola, facingAngle, fireballTrajectory, straightLine, homing, vecLength, sub } from './弹道.ts';

describe('弹道', () => {
  it('火球道：稳态速度 = 加速 × 惯性 ÷ (1 − 惯性)', () => {
    const trajectory = fireballTrajectory([0, 0, 0], [1, 0, 0], { inertia: 0.82 });
    expect(trajectory(0)).toEqual([0, 0, 0]);
    expect(trajectory(1)[0]).toBeCloseTo(0, 9); // 出生那一刻速度是 0
    expect(trajectory(2)[0]).toBeCloseTo(0.082, 9);
    expect(trajectory(61)[0] - trajectory(60)[0]).toBeCloseTo((0.1 * 0.82) / 0.18, 4);
  });
  it('抛到：按给的刻数正好落在目标', () => {
    const startPos = [0, 0, 5] as const;
    const target = [12, -3, 0] as const;
    const trajectory = parabola(startPos, throwTo(startPos, target, 30));
    expect(vecLength(sub(trajectory(30), target))).toBeLessThan(1e-9);
  });
  it('插值和命中刻', () => {
    const trajectory = straightLine([0, 0, 0], [1, 0, 0]);
    expect(trajectoryPos(trajectory, 2.5)[0]).toBeCloseTo(2.5);
    expect(hitTick(trajectory, [10, 0, 0], 0.5)).toBeCloseTo(9.5);
    expect(hitTick(trajectory, [10, 5, 0], 0.5)).toBeNull();
  });
  it('追踪：拐过去能打到侧面的目标', () => {
    const trajectory = homing([0, 0, 0], [0.5, 0, 0], [5, 5, 0], 0.2);
    expect(hitTick(trajectory, [5, 5, 0], 0.5)).not.toBeNull();
  });
  it('朝向角：朝北（MC 的 −z）是 yaw 180，朝上是 pitch −90', () => {
    expect(Math.abs(facingAngle([0, 1, 0]).yaw)).toBeCloseTo(180);
    expect(facingAngle([1, 0, 0]).yaw).toBeCloseTo(-90);
    expect(facingAngle([0, 0, 1]).pitch).toBeCloseTo(-90);
  });
});
