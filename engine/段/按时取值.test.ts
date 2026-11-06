import { describe, expect, it } from 'vitest';
import { 取档, 插表 } from './按时取值.ts';

describe('按时取值：一格一个值的老数据按秒读', () => {
  const 表 = [0, 10, 40];
  it('插表：格点上正好取那一项（含浮点误差贴回格点），格之间线性插值，头尾之外取头尾', () => {
    expect(插表(表, 1)).toBe(10);
    expect(插表(表, 0.4 * 2.5)).toBe(10);
    expect(插表(表, 1.5)).toBe(25);
    expect(插表(表, -3)).toBe(0);
    expect(插表(表, 9)).toBe(40);
  });
  it('取档：落在哪一格就取哪一项，不插值', () => {
    expect(取档(表, 1.99)).toBe(10);
    expect(取档(表, 0.4 * 5)).toBe(40);
    expect(取档(表, -1)).toBe(0);
    expect(取档(表, 7)).toBe(40);
    expect(取档(表, 3, { 值: -1 })).toBe(-1);
    expect(取档(表, -0.5, { 值: -1 })).toBe(-1);
    expect(取档(表, 2.9, { 值: -1 })).toBe(40);
  });
  it('空表报错', () => {
    expect(() => 插表([], 0)).toThrow();
    expect(() => 取档([], 0)).toThrow();
  });
});
