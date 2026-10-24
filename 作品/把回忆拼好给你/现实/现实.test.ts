import { describe, expect, it } from 'vitest';
import { 撕页本尺寸, 笔筒满度, 笔芯满根, 笔芯起根, 每页笔芯, 算撕页态, 翻页值, 页版式, 默认页们 } from './撕页.ts';
import { 找格, 星期们, 节们, 课表格们 } from './课表数据.ts';

describe('撕页', () => {
  it('整数翻页停在那一页、没有飞纸；越界夹到两头', () => {
    expect(算撕页态(0)).toEqual({ 顶: 100, 飞: [] });
    expect(算撕页态(2)).toEqual({ 顶: 31, 飞: [] });
    expect(算撕页态(4)).toEqual({ 顶: 1, 飞: [] });
    expect(算撕页态(-1)).toEqual({ 顶: 100, 飞: [] });
    expect(算撕页态(9)).toEqual({ 顶: 1, 飞: [] });
  });

  it('撕的过程中飞走的纸印着从高到低的天数，底下露出来的跟着往下走，快撕完时露出的是下一页', () => {
    const 早 = 算撕页态(1.05); // 62 → 31
    expect(早.飞.map((x) => x.数)).toEqual([62]);
    expect(早.顶).toBe(52);
    const 中 = 算撕页态(1.5);
    expect(中.飞.map((x) => x.数)).toEqual([62, 52, 41]);
    expect(中.顶).toBe(31);
    for (let p = 0.01; p < 1; p += 0.01) {
      const 态 = 算撕页态(1 + p);
      for (const x of 态.飞) expect(x.数).toBeGreaterThan(态.顶);
      expect(态.飞.every((x) => x.t > 0 && x.t < 1)).toBe(true);
    }
    expect(算撕页态(1.999).飞.length).toBeLessThanOrEqual(1);
  });

  it('只差一天时只飞一张', () => {
    const 态 = 算撕页态(0.5, [2, 1]);
    expect(态.飞).toEqual([{ 数: 2, t: 0.5 }]);
    expect(态.顶).toBe(1);
  });

  it('翻页值：每页在自己的落帧撕完，撕帧数之前不动', () => {
    const 落 = [10, 20, 30, 40, 50];
    expect(翻页值(0, 落, 6)).toBe(0);
    expect(翻页值(14, 落, 6)).toBe(0);
    expect(翻页值(17, 落, 6)).toBeCloseTo(0.5);
    expect(翻页值(20, 落, 6)).toBe(1);
    expect(翻页值(50, 落, 6)).toBe(4);
    expect(() => 翻页值(0, 落, 12)).toThrow(/重叠/);
  });

  it('笔筒满度跟着翻页一截一截涨，停在整数页上正好是整数根，不超过满', () => {
    expect(笔筒满度(0) * 笔芯满根).toBeCloseTo(笔芯起根);
    for (let k = 0; k < 默认页们.length; k++) {
      const 根 = 笔筒满度(k) * 笔芯满根;
      expect(Math.abs(根 - Math.round(根))).toBeLessThan(1e-9);
      expect(根).toBeCloseTo(笔芯起根 + 每页笔芯 * k);
    }
    expect(笔筒满度(默认页们.length - 1)).toBeLessThanOrEqual(1);
    expect(笔筒满度(1.5)).toBeGreaterThan(笔筒满度(1));
  });
});

describe('撕页本的页面', () => {
  it('每一页（连撕的时候飞过的中间天数）大数字和「天」都在页面里，「天」不碰右下角翻起来的那块', () => {
    const 页高 = 撕页本尺寸.高 - 撕页本尺寸.装订高;
    for (let 数 = 1; 数 <= 默认页们[0]!; 数++) {
      const v = 页版式(数);
      expect(v.数.x).toBeGreaterThanOrEqual(0);
      expect(v.天.x + v.天.宽).toBeLessThanOrEqual(撕页本尺寸.宽);
      expect(v.数.y + v.数.高).toBeLessThan(页高);
      // 翻角那块：从右下角量 i + j <= 翻角（i、j 是离右边、下边几个贴图像素）
      const i = 撕页本尺寸.宽 - (v.天.x + v.天.宽);
      const j = 页高 - (v.天.y + v.天.高);
      expect(i + j).toBeGreaterThan(撕页本尺寸.翻角);
    }
  });
});

describe('课表数据', () => {
  it('每一节每一天正好被一个格盖住（合并格不重叠、不漏）', () => {
    const 盖 = 节们.map(() => 星期们.map(() => 0));
    for (const g of 课表格们) for (let r = g.行; r < g.行 + g.跨行; r++) for (let c = g.列; c < g.列 + g.跨列; c++) 盖[r]![c]! += 1;
    expect(盖.flat().every((n) => n === 1)).toBe(true);
  });

  it('用户定的几处：晚自修只写自修、周六最后是周测、周日上午数学培优、周日早上留空', () => {
    expect(找格('周一', '晚自修二').字).toBe('自修');
    expect(找格('周六', '第9节').字).toBe('周测');
    expect(找格('周日', '第4节').字).toBe('数学培优班');
    expect(找格('周日', '第1节').字).toBe('');
    expect(找格('周一', '第1节').字).toBe('语');
  });
});
