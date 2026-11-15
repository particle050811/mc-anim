import { describe, expect, it } from 'vitest';
import { pickTier, interpTable } from './按时取值.ts';

describe('按时取值：一格一个值的老数据按秒读', () => {
  const valueTable = [0, 10, 40];
  it('插表：格点上正好取那一项（含浮点误差贴回格点），格之间线性插值，头尾之外取头尾', () => {
    expect(interpTable(valueTable, 1)).toBe(10);
    expect(interpTable(valueTable, 0.4 * 2.5)).toBe(10);
    expect(interpTable(valueTable, 1.5)).toBe(25);
    expect(interpTable(valueTable, -3)).toBe(0);
    expect(interpTable(valueTable, 9)).toBe(40);
  });
  it('取档：落在哪一格就取哪一项，不插值', () => {
    expect(pickTier(valueTable, 1.99)).toBe(10);
    expect(pickTier(valueTable, 0.4 * 5)).toBe(40);
    expect(pickTier(valueTable, -1)).toBe(0);
    expect(pickTier(valueTable, 7)).toBe(40);
    expect(pickTier(valueTable, 3, { 值: -1 })).toBe(-1);
    expect(pickTier(valueTable, -0.5, { 值: -1 })).toBe(-1);
    expect(pickTier(valueTable, 2.9, { 值: -1 })).toBe(40);
  });
  it('空表报错', () => {
    expect(() => interpTable([], 0)).toThrow();
    expect(() => pickTier([], 0)).toThrow();
  });
});
