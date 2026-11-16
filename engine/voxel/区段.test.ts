import { describe, expect, it } from 'vitest';
import { farDropMask, pickSections, sectionCells } from './区段.ts';

describe('远裁', () => {
  it('四块各按离镜头最近的点比 farM', () => {
    // 第 0 级区段 (1, 0)：x 64～128、y 0～64，四块 32 米
    const q = { L: 0, i: 1, j: 0 };
    expect(farDropMask(q, [0, 16, 0], 200)).toBe(0);
    expect(farDropMask(q, [0, 16, 0], 70)).toBe(0b1010); // x 96 起的两块远过 70 米
    expect(farDropMask(q, [0, 16, 0], 96)).toBe(0b1000); // (96, 0) 那块正好 96 米算画（和挑区段一样，大于才丢）
    expect(farDropMask(q, [0, -40, 0], 80)).toBe(0b1110); // 只剩最近的那块：(64, 0) 离 (0, −40) 75 米
  });
  it('挑到的区段至少留一块，裁完和按 32 格挑出来的范围一样', () => {
    const params = { camPos: [10, 20, 100], pixelAngle: 1e-3, splitPixels: 1e9, farM: 3000, inView: () => true, featureTop: () => 0 };
    const kept = new Set<string>();
    for (const q of pickSections(params)) {
      const mask = farDropMask(q, params.camPos, params.farM);
      expect(mask).not.toBe(15);
      for (let k = 0; k < 4; k++) if (!(mask & (1 << k))) kept.add(`${q.L}|${q.i * 2 + (k & 1)}|${q.j * 2 + (k >> 1)}`);
    }
    // 不细分时全是最粗一级：32 格一块时挑到的就是离镜头最近的点在 farM 以内的那些块
    const half = (sectionCells / 2) * 64;
    const expected = new Set<string>();
    for (let j = -4; j < 4; j++)
      for (let i = -4; i < 4; i++) {
        const d = Math.hypot(Math.max(i * half - 10, 0, 10 - i * half - half), Math.max(j * half - 20, 0, 20 - j * half - half));
        if (d <= 3000) expected.add(`6|${i}|${j}`);
      }
    expect(kept).toEqual(expected);
  });
});
