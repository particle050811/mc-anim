import { describe, expect, it } from 'vitest';
import { 吹法, 日历尺寸, 日历数, 满页, 离开秒, 纸厚, 页版式, 飞姿, 飞页们, 飞走几页 } from './日历.ts';
import { 找格, 星期们, 节们, 课表格们 } from './课表数据.ts';

const 窗 = { 起: 10, 止: 12 };

describe('风吹日历', () => {
  it('起风前停在 100，止 那一刻起停在 1；中间一路往下、不回头', () => {
    expect(日历数(9.9, 窗)).toBe(满页);
    expect(日历数(窗.止, 窗)).toBe(1);
    expect(日历数(13, 窗)).toBe(1);
    let 上 = 满页;
    for (let i = 0; i < 480; i++) {
      const 数 = 日历数(窗.起 + i / 240, 窗);
      expect(数).toBeLessThanOrEqual(上);
      expect(数).toBeGreaterThanOrEqual(2);
      上 = 数;
    }
  });

  it('越掉越快：每页离开的间隔一页比一页短，最后一页（2）正好在 止 飞走', () => {
    for (let k = 2; k < 满页 - 1; k++) expect(离开秒(k + 1, 窗) - 离开秒(k, 窗)).toBeLessThan(离开秒(k, 窗) - 离开秒(k - 1, 窗) + 1e-12);
    expect(离开秒(1, 窗)).toBe(窗.起);
    expect(离开秒(满页 - 1, 窗)).toBeCloseTo(窗.止);
    // 飞走几页 是 离开秒 的反函数：离开那一刻算飞走
    for (let k = 1; k < 满页; k++) expect(飞走几页(离开秒(k, 窗) + 1e-9, 窗)).toBeGreaterThanOrEqual(k);
  });

  it('空中的纸：印的数比本子上的大、龄在 0～1，每帧新飞的不超过 每帧最多 太多（不糊成一团白）', () => {
    for (let t = 窗.起; t < 窗.止 + 0.5; t += 1 / 24) {
      const 顶 = 日历数(t, 窗);
      const 飞 = 飞页们(t, 窗, 24);
      for (const x of 飞) {
        expect(x.数).toBeGreaterThan(顶);
        expect(x.龄).toBeGreaterThanOrEqual(0);
        expect(x.龄).toBeLessThan(1);
      }
      expect(飞.length).toBeLessThanOrEqual(Math.ceil(吹法.飞 * 24 * 吹法.每帧最多) + 2);
    }
  });

  it('飞姿往右上走，翻的高度在 1～页高；纸叠越吹越薄', () => {
    for (let 龄 = 0; 龄 <= 1; 龄 += 0.05) {
      const s = 飞姿(龄, 0.5);
      expect(s.dx).toBeGreaterThanOrEqual(0);
      expect(s.dz).toBeGreaterThanOrEqual(0);
      expect(s.高).toBeGreaterThanOrEqual(1);
      expect(s.高).toBeLessThanOrEqual(日历尺寸.页高);
    }
    expect(纸厚(满页)).toBe(日历尺寸.纸最厚);
    expect(纸厚(1)).toBe(日历尺寸.纸最薄);
  });

  it('每一页的大数字和「天」都在页面里', () => {
    for (let 数 = 1; 数 <= 满页; 数++) {
      const v = 页版式(数);
      expect(v.数.x).toBeGreaterThanOrEqual(0);
      expect(v.天.x + v.天.宽).toBeLessThanOrEqual(日历尺寸.宽);
      expect(v.数.y + v.数.高).toBeLessThanOrEqual(日历尺寸.页高);
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
