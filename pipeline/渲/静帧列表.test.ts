import { expect, it } from 'vitest';
import { stillFrameList } from './命令.ts';

it('接受独立位置参数、单个参数内的空格、逗号和闭区间，保持首次请求顺序', () => {
  expect(stillFrameList(['5  1', '2, 3-5', '0'], '甲', 6)).toEqual([5, 1, 2, 3, 4, 0]);
});

it.each(['', '-1', '2,', '1,,2', '1.5', '4-2', '3-x', '1-99999999999999', '6'])('不展开越界范围、不放过非法帧 %s', (rangeText) => {
  expect(() => stillFrameList([rangeText], '甲', 6)).toThrow();
});
