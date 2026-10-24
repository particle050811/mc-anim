import { describe, expect, it } from 'vitest';
import { 正片事件 } from './分镜.ts';
import { 分屏门在, 半屏取景, 默认天弧 } from './场/2-门口/参数.ts';
import { 分屏态, 分屏版式, 撕帧数, 落帧们, 落了几页, 每帧刻 } from './场/2-门口/分屏参数.ts';
import { 天体位置 } from './地点/天体.ts';
import { 算撕页态 } from './现实/撕页.ts';

const 静帧 = 正片事件.分屏静帧.帧;

describe('第 13 句分屏', () => {
  it('分屏静帧：31 刚落、下一页还没开始撕，树长到第 3 截，右屏褪色一半、没往夜里插', () => {
    const 态 = 分屏态(静帧);
    expect(态.翻页).toBe(2);
    expect(算撕页态(态.翻页)).toEqual({ 顶: 31, 飞: [] });
    expect(态.落了几页).toBe(3);
    expect(态.树进度).toBeCloseTo(3 / 5, 9);
    expect(态.褪色).toBeCloseTo(0.5, 9);
    expect(态.夜).toBe(0);
  });

  it('撕页窗口不重叠，静帧那一帧下一页的撕页还没开始', () => {
    for (let k = 1; k < 落帧们.length; k++) expect(落帧们[k]! - 撕帧数).toBeGreaterThanOrEqual(落帧们[k - 1]!);
    expect(落帧们[3]! - 撕帧数).toBeGreaterThanOrEqual(静帧);
  });

  it('每落一页长一截、换一个姿势：五页落完是整棵树', () => {
    expect(落帧们.map(落了几页)).toEqual([1, 2, 3, 4, 5]);
    expect(分屏态(落帧们[0]! - 1).树进度).toBe(0);
    expect(分屏态(落帧们[4]!).树进度).toBe(1);
  });

  it('太阳一拍转两天；静帧里太阳在右屏的天上，不在树和屋顶后面', () => {
    expect((每帧刻 * 0.42611 * 24) / 24000).toBeCloseTo(2, 6);
    const 取 = 半屏取景(分屏版式.右宽 * 2, 分屏门在);
    const 弧 = 默认天弧(取, 分屏版式.右宽, 720);
    const 日 = 天体位置(分屏态(静帧).刻, 弧).太阳;
    expect(日.高).toBeGreaterThan(0.5);
    // 第 3 截树顶 5 格（斜投影里多三分之一格）、屋脊 6.5 格；太阳本体 2 格见方
    expect(日.z - 1).toBeGreaterThan(7);
    const 半宽 = 分屏版式.右宽 / 取.每格;
    expect(Math.abs(日.x - 取.中心[0]) + 1).toBeLessThan(半宽);
  });
});
