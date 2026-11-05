// 蓝噪声表要是 0～1 上的一个排列（每档一个），相邻像素的差比白噪声（约 1/3）大：低频少
import { describe, expect, it } from 'vitest';
import { 蓝噪声, 蓝噪声边 } from './蓝噪声.ts';

describe('蓝噪声', () => {
  it('每档一个、低频少', () => {
    const b = 蓝噪声(), n = 蓝噪声边;
    expect(new Set(b).size).toBe(n * n);
    let 差 = 0;
    for (let i = 0; i < n * n; i++) 差 += Math.abs(b[i]! - b[Math.floor(i / n) * n + ((i % n) + 1) % n]!);
    expect(差 / (n * n)).toBeGreaterThan(0.38);
  });
});
