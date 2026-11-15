// 蓝噪声表要是 0～1 上的一个排列（每档一个），相邻像素的差比白噪声（约 1/3）大：低频少
import { describe, expect, it } from 'vitest';
import { blueNoise, blueNoiseEdge } from './蓝噪声.ts';

describe('蓝噪声', () => {
  it('每档一个、低频少', () => {
    const b = blueNoise(), n = blueNoiseEdge;
    expect(new Set(b).size).toBe(n * n);
    let sumAbsDiff = 0;
    for (let i = 0; i < n * n; i++) sumAbsDiff += Math.abs(b[i]! - b[Math.floor(i / n) * n + ((i % n) + 1) % n]!);
    expect(sumAbsDiff / (n * n)).toBeGreaterThan(0.38);
  });
});
